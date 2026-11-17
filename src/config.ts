/**
 * 发布前需要你填的两项。
 *
 * videoBvid  你的一个视频的 BV 号（例如 'BV1xx411c7mD'）。
 *            - 玩家给这个视频点赞 / 投币 / 收藏，开局就能拿到对应福利；
 *            - 「去关注」「去三连」按钮会跳到这个视频。
 *            - 留空：隐藏三连福利面板。
 *            注意：SDK 只能查询「本 Toy 作者自己的视频」（含联合投稿），填别人的视频查不到。
 *
 * authorMid  你的 B 站 UID（可选）。只在没填 videoBvid 时用到：「去关注」会跳到你的个人空间。
 *
 * 跳转按钮在标题页和结算页都有。目标的优先级：videoBvid 的视频 > authorMid 的空间 >
 * 都没填时，用你的昵称打开 B 站搜索（平台不告诉 Toy 作者的 UID，所以只能这样兜底）。
 */
export const config = {
  videoBvid: 'BV1Y3WQ6FEVf',
  authorMid: '248313639',
};
