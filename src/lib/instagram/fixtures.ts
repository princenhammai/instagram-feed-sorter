/** Realistic Instagram response shapes used by the batch runner and account finder. */

export const clipsPage = {
  status: 'ok',
  paging_info: { max_id: 'QVFB_page2', more_available: true },
  next_max_id: 'QVFB_page2',
  items: [
    {
      media: {
        pk: '3281928374650192837',
        id: '3281928374650192837_184921',
        code: 'C0AbCdEfGhI',
        media_type: 2,
        product_type: 'clips',
        taken_at: 1710000000,
        like_count: 12034,
        comment_count: 210,
        play_count: 980112,
        ig_play_count: 980112,
        video_duration: 14.2,
        caption: {
          pk: '180001',
          text: 'Stop scrolling.\nThe first line is the hook\n#reels #fyp',
        },
        user: { pk: '184921', username: 'omgadrian' },
        image_versions2: {
          candidates: [
            { width: 480, url: 'https://scontent.cdninstagram.com/v/t51/small.jpg' },
            { width: 720, url: 'https://scontent.cdninstagram.com/v/t51/cover.jpg' },
          ],
        },
        video_versions: [
          { width: 480, url: 'https://scontent.cdninstagram.com/o1/v/reel-small.mp4' },
          { width: 720, url: 'https://scontent.cdninstagram.com/o1/v/reel.mp4' },
        ],
        clips_metadata: {
          music_info: { music_asset_info: { title: 'Night Drive', display_artist: 'Ada' } },
        },
        is_paid_partnership: false,
      },
    },
    {
      media: {
        pk: '3281928374650192838',
        code: 'C0PaidReel1',
        media_type: 2,
        product_type: 'clips',
        taken_at: 1710001000,
        like_count: 800,
        comment_count: 12,
        play_count: 2_400_000,
        video_duration: 22,
        caption: { text: 'Care that fits your week. #ad #sponsored' },
        user: { username: 'omgadrian' },
        is_paid_partnership: true,
        sponsor_tags: [{ sponsor: { username: 'kaiserpermanente' } }],
        clips_metadata: { video_duration: 22 },
      },
    },
    {
      media: {
        pk: '3281928374650192837',
        code: 'C0AbCdEfGhI',
        media_type: 2,
        product_type: 'clips',
        play_count: 1,
        like_count: 1,
        comment_count: 0,
        caption: { text: 'duplicate page item' },
        user: { username: 'omgadrian' },
      },
    },
  ],
}

export const clipsPageEnd = {
  status: 'ok',
  items: [
    {
      media: {
        pk: '3282000000000000001',
        code: 'C0Quiet01',
        media_type: 2,
        product_type: 'clips',
        taken_at: 1710002000,
        like_count: 40,
        comment_count: 2,
        play_count: 900,
        caption: { text: '@friend just posted' },
        user: { username: 'omgadrian' },
        video_duration: 8,
      },
    },
  ],
  paging_info: { more_available: false, max_id: 'ignored' },
  next_max_id: 'ignored-when-done',
}

export const profileSuggestions = {
  data: {
    user: {
      id: '184921',
      username: 'omgadrian',
      edge_followed_by: { count: 120034 },
      edge_related_profiles: {
        edges: [
          {
            node: {
              id: '991',
              username: 'studio.north',
              full_name: 'Studio North',
              is_verified: true,
              is_private: false,
              edge_followed_by: { count: 5400 },
              profile_pic_url: 'https://scontent.cdninstagram.com/v/studio.jpg',
            },
          },
          {
            node: {
              username: 'instagram',
              full_name: 'Instagram',
              is_verified: true,
            },
          },
        ],
      },
    },
  },
}

export const followingPage = {
  users: [
    {
      pk: '55',
      username: 'cara.films',
      full_name: 'Cara Films',
      is_private: false,
      is_verified: false,
      follower_count: 3200,
      profile_pic_url: 'https://scontent.cdninstagram.com/v/cara.jpg',
    },
    {
      pk: '56',
      username: 'studio.north',
      full_name: 'Studio North',
      is_private: true,
      is_verified: false,
      follower_count: 5400,
    },
  ],
  next_max_id: '12',
  big_list: true,
  page_size: 12,
  status: 'ok',
}

export const rateLimitBody = {
  message: 'Please wait a few minutes before you try again.',
  status: 'fail',
  spam: true,
  feedback_title: 'Try Again Later',
}

export const privateBody = {
  message: 'Not authorized to view user',
  status: 'fail',
}
