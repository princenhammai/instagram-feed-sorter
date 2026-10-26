export const ISO_SOURCE = 'ifs-iso'
export const MAIN_SOURCE = 'ifs-main'

export type MainAction =
  | 'profile'
  | 'feed'
  | 'clips'
  | 'saved'
  | 'collection'
  | 'search'
  | 'media'
  | 'stories'
  | 'similar'
  | 'captured'
  | 'captured-accounts'
  | 'followers'
  | 'following'
  | 'user-search'
  | 'reels-search'
  | 'hashtag'

export interface MainCall {
  action: MainAction
  username?: string
  userId?: string
  maxId?: string
  collectionId?: string
  query?: string
  mediaId?: string
}
