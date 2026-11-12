/** Built-in danmaku text. Nothing here comes from players, so no input-safety check is needed. */

export const SCROLL_TEXT: readonly string[] = [
  '233333', '哈哈哈哈', '草', 'awsl', '前排', '就这？', '？？？', '下次一定', '爷青回', '泪目',
  '名场面', '好家伙', '绝了', '离谱', '笑死', '火钳刘明', '空降成功', '完结撒花', '打卡', '蚌埠住了',
  '芜湖起飞', '针不戳', '我裂开了', '有内味了', '妙啊', '合影', '来了来了', '这河里吗', '太强了', '细节',
  '恭喜发财', '梦开始的地方', '弹幕护体', '热乎的', '第一', '666', 'kksk', 'xswl', '好耶', '我超',
  // Deliberately overlapping characters, so 关键词 has something to bite on.
  '草草草', '太草了', '哈哈哈', '笑哈哈', '好活', '好听', '好看', '太好了', '6666', '下次了',
];

export const FIXED_TEXT: readonly string[] = ['前方高能', '非战斗人员撤离', '注意看', '护眼', '高能预警'];

export const BIG_TEXT: readonly string[] = ['取关了', '就这也能火', '三连呢', '白嫖', '催更！', '鸽了？', '恰饭了', '标题党'];

export const SPAM_TEXT: readonly string[] = ['刷屏啦', '666666', '哈哈哈哈哈', '保护保护'];

export const BOSS_NAME: Record<1 | 2, string> = { 1: '高能预警', 2: '弹幕护体' };
