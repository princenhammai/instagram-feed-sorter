#!/usr/bin/env python3
"""Local, offline breakdown of downloaded Reels.

Reads mp4 files already on disk. Uses ffmpeg for duration, contact sheets, and
scene cuts. Uses faster-whisper or whisper.cpp when one of them is installed,
and tesseract for on-screen text. Nothing is uploaded.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path


def frame_times(duration: float, every: float = 2.0) -> list[float]:
    if duration <= 0:
        return [0.0]
    step = every if every > 0 else 2.0
    times = [0.0]
    cursor = step
    while cursor < duration - 0.05:
        times.append(round(cursor, 3))
        cursor += step
    if times[-1] < duration:
        times.append(round(max(0.0, duration - 0.05), 3))
    return times


def first_second_times(duration: float) -> list[float]:
    limit = min(1.0, max(duration, 0.0))
    if limit <= 0:
        return [0.0]
    times = []
    cursor = 0.0
    while cursor <= limit + 1e-9:
        times.append(round(min(cursor, limit), 3))
        cursor += 0.25
    return times


def parse_scene_times(log: str) -> list[float]:
    found: list[float] = []
    for line in log.splitlines():
        marker = 'pts_time:'
        if marker not in line:
            continue
        raw = line.split(marker, 1)[1].split()[0].strip(',')
        try:
            value = float(raw)
        except ValueError:
            continue
        if value <= 0.05:
            continue
        if not found or abs(found[-1] - value) > 0.2:
            found.append(round(value, 3))
    return found


def markdown_report(report: dict) -> str:
    lines = [
        f"# {report['file']}",
        '',
        f"- Duration: {report['durationSeconds']}s",
        f"- Scene cuts: {', '.join(f'{item}s' for item in report['sceneCuts']) or 'none detected'}",
        f"- Frames: {len(report['frameSeconds'])} timestamps, about every {report['frameEverySeconds']}s",
        '',
        '## Transcript',
        '',
        report.get('transcript') or report.get('transcriptNote') or 'No transcript.',
        '',
        '## On-screen text',
        '',
        report.get('ocrText') or report.get('ocrNote') or 'No on-screen text.',
        '',
    ]
    if report.get('contactSheet'):
        lines.extend(['## Contact sheet', '', f"![Contact sheet]({report['contactSheet']})", ''])
    if report.get('firstSecondSheet'):
        lines.extend(['## First second', '', f"![First second]({report['firstSecondSheet']})", ''])
    return '\n'.join(lines)


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=False, text=True, capture_output=True)


def require_tool(name: str) -> str:
    found = shutil.which(name)
    if not found:
        raise SystemExit(f'{name} is not on PATH. Install it locally and run this again.')
    return found


def probe_duration(path: Path) -> float:
    ffprobe = require_tool('ffprobe')
    result = run([
        ffprobe,
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        str(path),
    ])
    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or f'ffprobe could not read {path.name}')
    try:
        return float(result.stdout.strip())
    except ValueError as error:
        raise SystemExit(f'ffprobe did not return a duration for {path.name}') from error


def contact_sheet(ffmpeg: str, path: Path, destination: Path, duration: float, every: float, first_second: bool) -> None:
    if first_second:
        select = "select='lte(t,1)',scale=320:-2,tile=4x2"
    else:
        rate = 1 / every if every > 0 else 0.5
        columns = 4
        count = max(1, math.ceil(duration / every)) if every > 0 else 1
        rows = max(1, math.ceil(count / columns))
        select = f'fps={rate},scale=320:-2,tile={columns}x{rows}'
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = run([
        ffmpeg, '-y', '-i', str(path),
        '-vf', select,
        '-frames:v', '1',
        str(destination),
    ])
    if result.returncode != 0 or not destination.exists():
        raise SystemExit(result.stderr.strip() or f'ffmpeg could not write {destination.name}')


def scene_cuts(ffmpeg: str, path: Path, threshold: float) -> list[float]:
    result = run([
        ffmpeg, '-i', str(path),
        '-vf', f"select='gt(scene,{threshold})',showinfo",
        '-f', 'null', '-',
    ])
    return parse_scene_times(result.stderr)


def transcribe(path: Path, ffmpeg: str, model: str | None) -> tuple[str | None, str | None]:
    wav = path.with_suffix('.breakdown.wav')
    extracted = run([ffmpeg, '-y', '-i', str(path), '-vn', '-ac', '1', '-ar', '16000', str(wav)])
    if extracted.returncode != 0:
        return None, 'ffmpeg could not extract audio for a transcript.'
    try:
        text = whisper_python(wav, model) or whisper_cpp(wav, model)
    finally:
        wav.unlink(missing_ok=True)
    if text:
        return text.strip(), None
    return None, 'No local transcriber is installed. Install faster-whisper or put whisper-cli on PATH.'


def whisper_python(wav: Path, model: str | None) -> str | None:
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception:
        return None
    whisper = WhisperModel(model or 'base', device='cpu', compute_type='int8')
    segments, _info = whisper.transcribe(str(wav))
    return ' '.join(segment.text.strip() for segment in segments).strip()


def whisper_cpp(wav: Path, model: str | None) -> str | None:
    binary = shutil.which('whisper-cli') or shutil.which('whisper-cpp')
    if not binary or not model:
        return None
    result = run([binary, '-m', model, '-f', str(wav), '--no-timestamps'])
    if result.returncode != 0:
        return None
    return (result.stdout or result.stderr).strip()


def ocr_image(image: Path) -> str | None:
    binary = shutil.which('tesseract')
    if not binary or not image.exists():
        return None
    result = run([binary, str(image), 'stdout', '--psm', '6'])
    if result.returncode != 0:
        return None
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return '\n'.join(dict.fromkeys(lines))


def breakdown(path: Path, out_dir: Path, every: float, threshold: float, model: str | None) -> dict:
    ffmpeg = require_tool('ffmpeg')
    duration = probe_duration(path)
    folder = out_dir / path.stem
    folder.mkdir(parents=True, exist_ok=True)
    contact = folder / 'contact.jpg'
    first = folder / 'first-second.jpg'
    contact_sheet(ffmpeg, path, contact, duration, every, False)
    contact_sheet(ffmpeg, path, first, duration, every, True)
    transcript, transcript_note = transcribe(path, ffmpeg, model)
    ocr_parts = [ocr_image(contact), ocr_image(first)]
    ocr_text = '\n'.join(part for part in ocr_parts if part)
    report = {
        'file': path.name,
        'durationSeconds': round(duration, 3),
        'frameEverySeconds': every,
        'frameSeconds': frame_times(duration, every),
        'firstSecondSeconds': first_second_times(duration),
        'sceneCuts': scene_cuts(ffmpeg, path, threshold),
        'contactSheet': contact.name,
        'firstSecondSheet': first.name,
        'transcript': transcript,
        'transcriptNote': transcript_note,
        'ocrText': ocr_text or None,
        'ocrNote': None if ocr_text or shutil.which('tesseract') else 'tesseract is not on PATH, so on-screen text was skipped.',
    }
    (folder / f'{path.stem}.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    (folder / f'{path.stem}.md').write_text(markdown_report(report), encoding='utf-8')
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Break down downloaded mp4s locally.')
    parser.add_argument('videos', nargs='+', help='mp4 files or a directory of them')
    parser.add_argument('--out', default='breakdowns', help='Directory for markdown, JSON, and contact sheets')
    parser.add_argument('--every', type=float, default=2.0, help='Seconds between contact-sheet frames')
    parser.add_argument('--scene', type=float, default=0.3, help='ffmpeg scene-cut threshold')
    parser.add_argument('--whisper-model', default='', help='faster-whisper model name, or a whisper.cpp model path')
    args = parser.parse_args(argv)
    paths: list[Path] = []
    for item in args.videos:
        candidate = Path(item)
        if candidate.is_dir():
            paths.extend(sorted(candidate.glob('*.mp4')))
        elif candidate.suffix.lower() == '.mp4' and candidate.is_file():
            paths.append(candidate)
    if not paths:
        raise SystemExit('No mp4 files found.')
    out_dir = Path(args.out)
    for path in paths:
        report = breakdown(path, out_dir, args.every, args.scene, args.whisper_model or None)
        print(f"{path.name}: {report['durationSeconds']}s, {len(report['sceneCuts'])} cuts, {out_dir / path.stem}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
