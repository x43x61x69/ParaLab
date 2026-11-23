/*
 * ParaLab Chinese converter: turns the Simplified Chinese text and font of a Paradise or
 * My Lab ROM into Traditional Chinese (Hong Kong, Taiwan or OpenCC standard), entirely in
 * the browser. Port of the MIT-licensed tamagotchi-paradise-zh-patcher core (text, glyphs,
 * archives, checksums and the My Lab Settings > Language patch).
 *
 * Data: third_party/zh_js/opencc_data.js (OpenCC, Apache-2.0) and the glyph packs in
 * third_party/zh_js/glyphs_*.js (SIL OFL 1.1). Load them before this file in the browser;
 * Node loads them on demand.
 *
 *   ParaLabZh.inspect(rom)                       -> what was found, needsConversion
 *   ParaLabZh.patch(rom, { variant, font, ... }) -> { rom, report }
 *   ParaLabZh.verify(original, patched)          -> list of problems (empty = fine)
 *
 * Pure functions on Uint8Array, no DOM.
 */
(function (root) {
'use strict';

// ------------------------------------------------------------------ data
function zhData() {
  let D = root.ParaLabZhData;
  if ((!D || !D.opencc || !D.glyphs || !D.glyphs.cubic11 || !D.glyphs.fusion12) && typeof require === 'function') {
    for (const f of ['opencc_data', 'glyphs_cubic11', 'glyphs_fusion12']) {
      try { require('../third_party/zh_js/' + f + '.js'); } catch (e) { /* reported below */ }
    }
    D = root.ParaLabZhData;
  }
  if (!D || !D.opencc) throw new Error('Chinese conversion data is not loaded (third_party/zh_js/opencc_data.js)');
  return D;
}
function fromBase64(s) {
  if (typeof atob === 'function') {
    const bin = atob(s), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

// --------------------------------------------------------------- helpers
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function w32(b, o, v) { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; }
function u32At(b, o) { return o >= 0 && o + 4 <= b.length ? u32(b, o) : null; }
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function arrEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
const align4 = (n) => (n + 3) & ~3;
const cpStr = (cps) => String.fromCodePoint(...cps);
const cpsOf = (s) => Array.from(s, (c) => c.codePointAt(0));
const numSort = (a, b) => a - b;
function bytesKey(b) { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; }

class ZhError extends Error {
  constructor(kind, message) { super(message); this.name = 'ZhError'; this.kind = kind; }
}
const fail = (kind, msg) => { throw new ZhError(kind, msg); };
const fmtErr = (msg) => fail('format', 'unexpected data format: ' + msg);

// ------------------------------------------------------------------ ARC2
const ARC_MAGIC = 0x32435241;
function arcTotalLen(d) {
  const n = u32At(d, 8);
  if (n === null) fmtErr('archive truncated');
  return 16 + n;
}
function arcChecksum(d) {
  const end = arcTotalLen(d);
  if (end > d.length) fmtErr('archive length exceeds buffer');
  let s = 0;
  for (let i = 8; i < end; i++) s = (s + d[i]) >>> 0;
  return s;
}
function arcChecksumOk(d) {
  try { return arcChecksum(d) === u32(d, 4); } catch (e) { return false; }
}
function arcParse(d) {
  if (u32At(d, 0) !== ARC_MAGIC) fmtErr('missing ARC2 magic');
  const total = arcTotalLen(d);
  if (total > d.length) fmtErr('archive length exceeds buffer');
  const n = u32At(d, 12);
  if (n === null) fmtErr('archive truncated');
  if (n > 0x10000) fmtErr('implausible file count');
  const files = [];
  for (let i = 0; i < n; i++) {
    const e = 16 + i * 16;
    const flags = u32At(d, e), off = u32At(d, e + 4), ulen = u32At(d, e + 12);
    if (flags === null || off === null || ulen === null) fmtErr('archive truncated');
    if (off + ulen > total) fmtErr('entry ' + i + ' out of range');
    files.push({ flags, data: d.slice(off, off + ulen) });
  }
  return files;
}
function arcBuild(files) {
  const n = files.length;
  let bodyLen = n * 16;
  for (const f of files) bodyLen += align4(f.data.length);
  const out = new Uint8Array(16 + bodyLen);
  w32(out, 0, ARC_MAGIC); w32(out, 8, bodyLen); w32(out, 12, n);
  let cursor = 16 + n * 16;
  files.forEach((f, i) => {
    const e = 16 + i * 16, cl = align4(f.data.length);
    w32(out, e, f.flags); w32(out, e + 4, cursor); w32(out, e + 8, cl); w32(out, e + 12, f.data.length);
    out.set(f.data, cursor);
    cursor += cl;
  });
  let sum = 0;
  for (let i = 8; i < out.length; i++) sum = (sum + out[i]) >>> 0;
  w32(out, 4, sum);
  return out;
}

// ----------------------------------------------------------- sprite pack
function packParse(d) {
  if (d.length < 4) fmtErr('sprite pack too small');
  const first = u32(d, 0);
  if (first % 4 || first === 0 || first > d.length) fmtErr('bad sprite pack table');
  const n = first / 4, offs = [];
  for (let i = 0; i < n; i++) offs.push(u32(d, i * 4));
  offs.push(d.length);
  const blobs = [];
  for (let i = 0; i < n; i++) {
    if (offs[i] > offs[i + 1] || offs[i + 1] > d.length) fmtErr('sprite ' + i + ' offsets not ascending');
    blobs.push(d.slice(offs[i], offs[i + 1]));
  }
  return blobs;
}
function packBuild(blobs) {
  let total = 4 * blobs.length;
  for (const b of blobs) total += b.length;
  const out = new Uint8Array(total);
  let cursor = 4 * blobs.length;
  blobs.forEach((b, i) => { w32(out, i * 4, cursor); out.set(b, cursor); cursor += b.length; });
  return out;
}
function spriteHeader(b) {
  if (b.length < 24) return null;
  return { dataLength: u32(b, 0), flags: b[4], bpp: b[5], numSprites: u16(b, 6), width: b[8], height: b[9],
    paletteOffset: u16(b, 18), pixelOffset: u16(b, 20) };
}

// ---------------------------------------------------------- string table
function tableParse(d) {
  if (d.length % 2 || d.length < 8) fmtErr('string table size');
  const words = new Uint16Array(d.length / 2);
  for (let i = 0; i < words.length; i++) words[i] = u16(d, i * 2);
  const indexLen = words[1];
  if (indexLen < 3 || indexLen > words.length) fmtErr('string table index length');
  if (words[0] !== indexLen - 2) fmtErr('string table header mismatch');
  if (words[indexLen - 1] !== words.length) fmtErr('string table end offset mismatch');
  const strings = [];
  for (let i = 1; i <= indexLen - 2; i++) {
    const a = words[i], b = words[i + 1];
    if (a > b || b > words.length || a < indexLen) fmtErr('string ' + i + ' offsets invalid');
    strings.push(Array.from(words.subarray(a, b)));
  }
  return { strings };
}
function tableSerialize(t) {
  const count = t.strings.length, indexLen = count + 2;
  let total = indexLen;
  for (const s of t.strings) total += s.length;
  const out = new Uint8Array(total * 2);
  let w = 0;
  const put = (v) => { out[w++] = v & 255; out[w++] = (v >> 8) & 255; };
  put(indexLen - 2);
  let cursor = indexLen;
  for (const s of t.strings) { put(cursor); cursor += s.length; }
  put(cursor);
  for (const s of t.strings) for (const c of s) put(c);
  return out;
}
function tableFitsU16(t) {
  let n = t.strings.length + 2;
  for (const s of t.strings) n += s.length;
  return n <= 0xFFFF;
}
const tableClone = (t) => ({ strings: t.strings.map((s) => s.slice()) });

// --------------------------------------------------------------- charset
const CODE_BASE = 481;
const SYMBOL_GLYPHS = 480;
const LATIN = (() => {
  const m = new Map([[' ', 305], ['+', 316], ['-', 317], ['!', 187], ['?', 188], ['&', 189]]);
  for (let i = 0; i < 10; i++) m.set(String(i), 306 + i);
  for (let i = 0; i < 26; i++) { m.set(String.fromCharCode(65 + i), 318 + i); m.set(String.fromCharCode(97 + i), 344 + i); }
  const byCp = new Map(), byCode = new Map();
  for (const [c, code] of m) byCp.set(c.codePointAt(0), code);
  for (let cp = 0x20; cp <= 0x7A; cp++) { const code = byCp.get(cp); if (code !== undefined && !byCode.has(code)) byCode.set(code, cp); }
  return { byCp, byCode };
})();
const latinCode = (cp) => LATIN.byCp.has(cp) ? LATIN.byCp.get(cp) : null;
const latinChar = (code) => LATIN.byCode.has(code) ? LATIN.byCode.get(code) : null;

function decodePairs(label, leadFrom, leadTo, skip) {
  const dec = new TextDecoder(label, { fatal: true });
  const set = new Set(), pair = new Uint8Array(2);
  for (let a = leadFrom; a <= leadTo; a++) for (let b = 0xA1; b <= 0xFE; b++) {
    if (skip && skip(a, b)) continue;
    pair[0] = a; pair[1] = b;
    let s;
    try { s = dec.decode(pair); } catch (e) { continue; }
    const cps = cpsOf(s);
    if (cps.length === 1) set.add(cps[0]);
  }
  return [...set].sort(numSort);
}
let charsetCache = null;
function charset() {
  if (charsetCache) return charsetCache;
  const chars = decodePairs('euc-kr', 0xB0, 0xC8);
  const hangulEnd = chars.length;
  chars.push(0x3000, 0x3000);
  for (let c = 0x3105; c <= 0x3129; c++) chars.push(c);
  for (let c = 0x3220; c <= 0x3229; c++) chars.push(c);
  const hanziStart = chars.length;
  chars.push(...decodePairs('gbk', 0xB0, 0xF7, (a, b) => a === 0xD7 && b > 0xF9));
  const index = new Map();
  chars.forEach((c, i) => { if (!index.has(c)) index.set(c, i); });
  if (hangulEnd !== 2350 || chars.length !== 9162) throw new Error('this browser cannot rebuild the game charset (EUC-KR/GBK decoders missing)');
  const cs = {
    chars, hangulEnd, hanziStart, len: chars.length, glyphTotal: SYMBOL_GLYPHS + chars.length,
    codeOf: (c) => index.has(c) ? CODE_BASE + index.get(c) : null,
    charOfCode: (code) => code >= CODE_BASE && code - CODE_BASE < chars.length ? chars[code - CODE_BASE] : null,
    isHanziCode: (code) => code >= CODE_BASE && code - CODE_BASE >= hanziStart && code - CODE_BASE < chars.length,
    isHangulCode: (code) => code >= CODE_BASE && code - CODE_BASE < hangulEnd,
  };
  charsetCache = cs;
  return cs;
}
const glyphOfCode = (code) => code - 1;

// GB2312 hanzi of the game font that the WHATWG/encoding_rs Big5 encoder rejects (it
// accepts the HKSCS rows 0xFA..0xFE, which some built-in Big5 decoders lack, so this is
// stored instead of probing TextDecoder). 2275 characters, sorted by code point.
const SIMPLIFIED_ONLY = new Set(cpsOf(
  '专业丛东丝丢两严丧丨个丬临为丽举乌乐乔习乡书买乱争亏亘亚产亩亲亵亻亿仅从仑仓仪仫们众会伛伞伟传伤伥伦伧伪伫伲佥侠侣侥侦侧侨侩侪侬俣俦俨俩俪俭倮债倾偬偻偾偿傈傥傧储傩兑兖兰关兴兹养兽冁内册写军农冯冻净凛' +
  '凤凫凯击凼凿刍刘则刚创删别刭刹刽刿剀剂剐剑剥剧劐劝办务劢动励劲劳势勋匀匦匮区医华协单卖卟卢卤卧卫卺厅历厉压厌厍厕厢厣厩县参双发变号叹叽吕吖吗吣吲吴呋呐呒呓呕呖呗员呙呛呜咔咙咛咝咣咴哌响哐哑哒哓哔哕哗哙' +
  '哚哜哝哟唛唠唢唣唤唿啧啬啭啮啸喷喹喽喾嗪嗫嗬嗳嗵嘘嘞嘣嘤嘭嘱噔噜噻噼嚣嚯团围囵国图圆圹场块坚坛坜坝坞坟坠垄垅垆垒垡垦垧垩垫垭垲垴埘埙埚埝埯堑堕塄塬墒墙墚壮声壳壶夂处备头夹夺奁奂奋奖奥妆妇妈妩妪妫姗娄娅' +
  '娆娇娈娱娲娴婴婵婶媪嫒嫔嫱嬷孙学孪实宠审宫宽宾寝对寻导将尘尜尝尧尴尽层届属屡屦屿岁岂岖岗岘岙岚岛岽岿峁峄峡峤峥峦崂崃崭崾嵘嵛嵝嵴巅巩巯币帅师帏帐帜带帧帱帻帼幂幞庆庐庑库应庙庞废廪开弃弑张弥弪弯弹归当录' +
  '彦径徕忄忆忧忾态怂怃怄怅怆总怼怿恋恳恶恸恹恺恻恼恽悦悫悬悭悯惧惨惩惫惬惭惮惯愠愤愦慑憷懑懒懔戆戋戏戗战戬户扌执扩扪扫扬抚抛抟抠抡抢护报拢拣拥拦拧拨择挚挛挝挞挟挠挡挢挣挤挥捞损捡换捣掳掴掷掸掺掼揞揽揿搀' +
  '搁搂搅摄摅摆摇摈摊撄撑撵撷撸撺擀擞攒攵敌敛敫数斋斓斩断旧时旷昙昼显晓晔晕晖暂暧术杀杂权条来杨杩枞枢枣枥枧枨枪枫枭柠柽栀栅标栈栉栊栋栌栎栏树桊桕桠桡桢档桤桥桦桧桨桩检棂椟椠椤椭楼榀榄榇榈榉槛槟槠横樯樱橥' +
  '橱橹橼檩檫欢欤欧歼殁殇残殒殓殚殡殴毁毂毕毙毪毵氇氢氩氲氵氽汇汤沟没沣沤沥沦沧沩沪沲泪泶泷泸泺泻泼泽泾浃浅浆浇浈浊测浍济浏浑浒浓浔涛涝涞涟涠涡涣涤润涧涨涩渊渌渍渎渐渑渔渖渗温湾湿溃溅溆溻滗滚滞滟滠满滢滤' +
  '滥滦滨滩漤潆潇潋潍澜濑濒灏灬灭灯灵灿炀炉炜炝点炻炼烀烁烂烃烛烦烧烨烩烫烬热焕焖焘煳煺熘爱爷牍牦牵牺犊犏犟犭状犷犸犹狈狍狞独狭狮狯狰狱狲猃猎猕猡猬猸猹獭玑玛玮环现玺珐珑珲琏琐琼瑷璎瓒瓯甙电画畅畲畴疃疖疗' +
  '疟疠疡疬疮疯疱痃痈痉痖痨痪痫瘅瘗瘘瘪瘫瘾瘿癀癍癔癞癣癫皑皱皲盏盐监盖盗盘眍睁睃睐睑瞒瞩矫矶矾矿砀码砖砗砘砚砜砹砺砻砾础硇硕硖硗硷碍碛碜碹磙礻祢祯祷祸禄禅秃积称秽稆税稣稳穑穷窃窍窑窜窝窥窦窭竖竞笃笋笔笕' +
  '笺笼笾筚筛筝筢筹筻签简箢箦箧箨箩箪箫篑篓篮篼簖籁籴类籼粜粝粤粪粮糁糇糍紧絷纟纠纡红纣纤纥约级纨纩纪纫纬纭纯纰纱纲纳纵纶纷纸纹纺纽纾线绀绁绂练组绅细织终绉绊绋绌绍绎经绐绑绒结绔绕绗绘给绚绛络绝绞统绠绡绢' +
  '绣绥绦继绨绩绪绫续绮绯绰绱绲绳维绵绶绷绸绺绻综绽绾绿缀缁缂缃缄缅缆缇缈缉缋缌缍缎缏缑缒缓缔缕编缗缘缙缚缛缜缝缟缠缡缢缣缤缥缦缧缨缩缪缫缬缭缮缯缰缱缲缳缴缵罂罗罚罢罱罴羁羟翘耠耢耥耧耱耸耻聂聋职聍联聩聪' +
  '肀肃肟肠肤肷肼肽肾肿胀胁胆胧胨胩胪胫胬胶脉脍脎脏脐脑脒脓脔脚脱脲脶脸腈腙腚腭腻腼腽腾膑膪臁舆舣舭舰舱舻舾艰艳艹艺节芈芗芜芦芪苁苄苇苈苊苋苌苍苎苏苘苷茎茏茑茔茕茚荆荚荛荜荞荟荠荡荤荥荦荧荨荩荪荫荬荭荮药' +
  '莅莜莱莲莳莴莶获莸莺莼萘萜萝营萦萧萨葜葱蒇蒈蒉蒋蒌蒽蓝蓟蓠蓣蓥蓦蔷蔸蔹蔺蔼蕲蕴薮藁藓蘖虏虑虚虬虽虾虿蚀蚁蚂蚬蛊蛎蛏蛮蛰蛱蛲蛳蛴蜕蜗蝇蝈蝉蝰蝼蝾螋螨蟮衅衔衤补衬衮袅袜袭装裆裢裣裤裥褛褴见观规觅视觇览觉觊' +
  '觋觌觎觏觐觑觞觯誉誊讠计订讣认讥讦讧讨让讪讫训议讯记讲讳讴讵讶讷许讹论讼讽设访诀证诂诃评诅识诈诉诊诋诌词诎诏译诒诓诔试诖诗诘诙诚诛诜话诞诟诠诡询诣诤该详诧诨诩诫诬语诮误诰诱诲诳说诵诶请诸诹诺读诼诽课诿' +
  '谀谁谂调谄谅谆谇谈谊谋谌谍谎谏谐谑谒谓谔谕谖谗谘谙谚谛谜谝谟谠谡谢谣谤谥谦谧谨谩谪谫谬谭谮谯谰谱谲谳谴谵谶贝贞负贡财责贤败账货质贩贪贫贬购贮贯贰贱贲贳贴贵贶贷贸费贺贻贼贽贾贿赀赁赂赃资赅赆赇赈赉赊赋赌' +
  '赍赎赏赐赓赔赕赖赘赙赚赛赜赝赞赠赡赢赣赵趋趱趸跃跄跞践跷跸跹跻踌踪踬踯踺蹑蹒蹰蹿躏躜躯軎车轧轨轩轫转轭轮软轰轱轲轳轴轵轶轷轸轹轺轻轼载轾轿辁辂较辄辅辆辇辈辉辊辋辍辎辏辐辑输辔辕辖辗辘辙辚辞辩辫辶边辽达' +
  '迁过迈运还这进远违连迟迩迳迹选逊递逦逻遗遥邓邝邬邮邹邺邻郄郏郐郑郓郦郧郸酝酞酰酱酶酽酾酿醌释鉴銮錾鐾钅钆钇针钉钊钋钌钍钎钏钐钒钓钔钕钗钙钚钛钜钝钞钟钠钡钢钣钤钥钦钧钨钩钪钫钬钭钮钯钰钱钲钳钴钵钶钷钸钹' +
  '钺钻钼钽钾钿铀铁铂铃铄铅铆铈铉铊铋铌铍铎铐铑铒铕铖铗铘铙铛铜铝铞铟铠铡铢铣铤铥铧铨铩铪铫铬铭铮铯铰铱铲铳铴铵银铷铸铹铺铼铽链铿销锁锂锃锄锅锆锇锈锉锊锋锌锍锎锏锐锑锒锓锔锕锖锗锘错锚锛锝锞锟锡锢锣锤锥锦' +
  '锨锩锪锫锬锭键锯锰锱锲锴锵锶锷锸锹锺锻锼锾锿镀镁镂镄镅镆镇镉镊镌镍镎镏镐镑镒镓镔镖镗镘镙镛镜镝镞镟镡镢镣镤镥镦镧镨镩镪镫镬镭镯镰镱镲镳镶长门闩闪闫闭问闯闰闱闲闳间闵闶闷闸闹闺闻闼闽闾阀阁阂阃阄阅阆阈阉' +
  '阊阋阌阍阎阏阐阑阒阔阕阖阗阙阚阝队阳阴阵阶际陆陇陈陉陕陧陨险随隐隽难雏雠雳雾霁霭靓静靥鞑鞒鞯鞲鞴韦韧韩韪韫韬韵页顶顷顸项顺须顼顽顾顿颀颁颂颃预颅领颇颈颉颊颌颍颏颐频颓颔颖颗题颚颛颜额颞颟颠颡颢颤颥颦颧' +
  '风飑飒飓飕飘飙飚飞飨餍饣饥饧饨饩饪饫饬饭饮饯饰饱饲饴饵饶饷饺饼饽饿馀馁馄馅馆馇馈馊馋馍馏馐馑馒馓馔馕马驭驮驯驰驱驳驴驵驶驷驸驹驺驻驼驽驾驿骀骁骂骄骅骆骇骈骊骋验骏骐骑骒骓骖骗骘骚骛骜骝骞骟骠骡骢骣骤骥' +
  '骧骶骺髅髋髌鬏鬓魇魉鱼鱿鲁鲂鲅鲆鲇鲈鲋鲍鲎鲐鲑鲒鲔鲕鲚鲛鲜鲞鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲫鲭鲮鲰鲱鲲鲳鲴鲵鲶鲷鲸鲺鲻鲼鲽鳃鳄鳅鳆鳇鳊鳋鳌鳍鳎鳏鳐鳓鳔鳕鳖鳗鳘鳙鳜鳝鳞鳟鳢鸟鸠鸡鸢鸣鸥鸦鸨鸩鸪鸫鸬鸭鸯鸱鸲鸳鸵鸶' +
  '鸷鸸鸹鸺鸽鸾鸿鹁鹂鹃鹄鹅鹆鹇鹈鹉鹊鹋鹌鹎鹏鹑鹕鹗鹘鹚鹛鹜鹞鹣鹤鹦鹧鹨鹩鹪鹫鹬鹭鹰鹱鹳鹾麦麸麽黄黉黢黩黪黾鼋鼍鼗鼹齄齐齑齿龀龃龄龅龆龇龈龉龊龋龌龙龚龛龟'));
// Only defined for GB2312 hanzi, the only characters it is asked about.
const traditionalEncodable = (cp) => !SIMPLIFIED_ONLY.has(cp);

// ---------------------------------------------------------------- OpenCC
const VARIANTS = {
  hk: { id: 'hk', label: 'Traditional (Hong Kong)', suffix: 'zh-hk', variants: 'HKVariants' },
  tw: { id: 'tw', label: 'Traditional (Taiwan)', suffix: 'zh-tw', variants: 'TWVariants' },
  standard: { id: 'standard', label: 'Traditional (OpenCC standard)', suffix: 'zht', variants: null },
};
function variantOf(v) {
  const key = String(v || 'hk').toLowerCase();
  const alias = { 'zh-hk': 'hk', 'zh-tw': 'tw', s2t: 'standard', s2hk: 'hk', s2tw: 'tw', zht: 'standard' };
  const out = VARIANTS[alias[key] || key];
  if (!out) fail('unsupported', 'unknown variant ' + v + ' (use hk, tw or standard)');
  return out;
}
const dictCache = new Map();
function dict(name) {
  if (dictCache.has(name)) return dictCache.get(name);
  const text = zhData().opencc[name];
  if (typeof text !== 'string') throw new Error('OpenCC dictionary ' + name + ' is missing');
  const map = new Map();
  let maxLen = 0;
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const k = line.slice(0, tab);
    map.set(k, cpsOf(line.slice(tab + 1)));
    maxLen = Math.max(maxLen, cpsOf(k).length);
  }
  const d = { map, maxLen };
  dictCache.set(name, d);
  return d;
}
// ferrous-opencc semantics: each stage replaces the longest dictionary prefix greedily;
// in a group the longest match wins and the first dictionary wins ties.
function applyStage(cps, group) {
  const out = [];
  let i = 0;
  while (i < cps.length) {
    let best = null, bestLen = 0;
    for (const d of group) {
      for (let L = Math.min(d.maxLen, cps.length - i); L > bestLen; L--) {
        const v = d.map.get(cpStr(cps.slice(i, i + L)));
        if (v) { best = v; bestLen = L; break; }
      }
    }
    if (best) { out.push(...best); i += bestLen; } else { out.push(cps[i]); i++; }
  }
  return out;
}
function makeOpenCC(variant) {
  const stages = [[dict('STPhrases'), dict('STCharacters')]];
  if (variant.variants) stages.push([dict(variant.variants)]);
  return (cps) => { for (const s of stages) cps = applyStage(cps, s); return cps; };
}

// --------------------------------------------------------------- mapping
const PUA_BASE = 0x100000;
const INSERTED = 0xFFFF;
function expandPlaceholders(s) {
  const chars = cpsOf(s), out = [];
  for (let i = 0; i < chars.length;) {
    if (chars[i] === 0x3C) {
      let j = i + 1, digits = '';
      while (j < chars.length && chars[j] >= 0x30 && chars[j] <= 0x39) digits += String.fromCharCode(chars[j++]);
      if (digits && chars[j] === 0x3E) {
        const n = Number(digits);
        if (/^\d+$/.test(digits) && n <= 0xFFFF) { out.push(PUA_BASE + n); i = j + 1; continue; }
      }
    }
    out.push(chars[i]); i++;
  }
  return out;
}
function cmpCps(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
function parseMapping(input) {
  if (input == null || input === '') return [];
  let obj = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch (e) { fail('mapping', 'text mapping: not valid JSON: ' + e.message); }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('mapping', 'text mapping: expected an object like {"原文": "替換"}');
  const entries = [];
  for (const label of Object.keys(obj)) {
    const v = obj[label];
    if (typeof v !== 'string') fail('mapping', 'text mapping: the value for "' + label + '" must be a string');
    let k = label, id = null;
    if (k.startsWith('@')) {
      const m = /^@(\d+):([\s\S]*)$/.exec(k);
      if (!m || !(Number(m[1]) > 0)) fail('mapping', 'text mapping: the key "' + label + '" has an invalid string id (use @<id>: with an id from the string list)');
      id = Number(m[1]); k = m[2];
    }
    const atStart = k.startsWith('^');
    if (atStart) k = k.slice(1);
    const atEnd = k.endsWith('$');
    if (atEnd) k = k.slice(0, -1);
    if (!k) fail('mapping', 'text mapping: the key "' + label + '" is empty');
    entries.push({ label, labelCps: cpsOf(label), id, key: expandPlaceholders(k), value: expandPlaceholders(v), atStart, atEnd });
  }
  entries.sort((a, b) => ((a.id === null) - (b.id === null)) || (b.key.length - a.key.length) || cmpCps(a.labelCps, b.labelCps));
  return entries;
}
function viewChars(cs, codes) {
  return codes.map((c) => {
    if (cs.isHanziCode(c)) return cs.charOfCode(c);
    const l = latinChar(c);
    return l !== null ? l : PUA_BASE + c;
  });
}
function mappingMatchAt(entries, view, at, id) {
  let end = view.indexOf(PUA_BASE);
  if (end < 0) end = view.length;
  for (let m = 0; m < entries.length; m++) {
    const e = entries[m];
    if (e.id !== null && e.id !== id) continue;
    if (e.atStart && at !== 0) continue;
    if (at + e.key.length > view.length) continue;
    let ok = true;
    for (let j = 0; j < e.key.length; j++) if (view[at + j] !== e.key[j]) { ok = false; break; }
    if (!ok) continue;
    if (e.atEnd && at + e.key.length !== end) continue;
    return m;
  }
  return -1;
}
function mappingAppliesTo(entries, cs, codes, id) {
  const view = viewChars(cs, codes);
  for (let i = 0; i < view.length; i++) if (mappingMatchAt(entries, view, i, id) >= 0) return true;
  return false;
}

// ------------------------------------------------------------- converter
const isIdeograph = (c) => (c >= 0x3400 && c <= 0x4DBF) || (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF);
const supplement = (c) => c === 0x6237 ? 0x6236 : c === 0x6E29 ? 0x6EAB : c; // 户→戶, 温→溫
function literalToken(cs, c) {
  const l = latinCode(c);
  if (l !== null) return { code: l, target: null };
  if (c >= PUA_BASE && c <= PUA_BASE + 0xFFFF) return { code: c - PUA_BASE, target: null };
  const code = cs.codeOf(c);
  if (code !== null) return { code, target: cs.isHanziCode(code) ? c : null };
  return isIdeograph(c) ? { code: INSERTED, target: c } : null;
}
const codeToChar = (cs, code) => cs.isHanziCode(code) ? cs.charOfCode(code) : PUA_BASE + code;

function makeConverter(variant, mappingInput, cs) {
  const cc = makeOpenCC(variant);
  const all = Array.isArray(mappingInput) ? mappingInput : parseMapping(mappingInput);
  for (const e of all) {
    const bad = e.value.find((c) => literalToken(cs, c) === null);
    if (bad !== undefined) fail('mapping', 'text mapping: "' + e.label + '": cannot show the character "' + String.fromCodePoint(bad) + '" (use letters, digits, space, + - ! ? & or Chinese characters)');
  }
  function convertPlain(codes) {
    if (!codes.length) return [];
    const out = cc(codes.map((c) => codeToChar(cs, c)));
    const aligned = out.length === codes.length;
    return codes.map((code, i) => {
      if (!cs.isHanziCode(code)) return { code, target: null };
      const source = cs.charOfCode(code);
      let target;
      if (aligned) target = out[i];
      else { const single = cc([source]); target = single.length === 1 ? single[0] : source; }
      if (target === source) target = supplement(source);
      return { code, target };
    });
  }
  function isIdentity(e) {
    const codes = [];
    for (const c of e.key) {
      let code;
      if (c >= PUA_BASE && c <= PUA_BASE + 0xFFFF) code = c - PUA_BASE;
      else { code = latinCode(c); if (code === null) code = cs.codeOf(c); if (code === null) return false; }
      codes.push(code);
    }
    const out = [];
    for (const t of convertPlain(codes)) { if (t.target !== null) out.push(t.target); else out.push(...viewChars(cs, [t.code])); }
    return arrEqual(out, e.value);
  }
  const mapping = all.filter((e) => !isIdentity(e));
  const hits = new Array(mapping.length).fill(0);
  function convertCodes(id, codes) {
    if (!mapping.length) return convertPlain(codes);
    const view = viewChars(cs, codes), out = [];
    let start = 0, i = 0;
    while (i < codes.length) {
      const m = mappingMatchAt(mapping, view, i, id);
      if (m < 0) { i++; continue; }
      out.push(...convertPlain(codes.slice(start, i)));
      for (const c of mapping[m].value) out.push(literalToken(cs, c));
      hits[m]++;
      i += mapping[m].key.length;
      start = i;
    }
    out.push(...convertPlain(codes.slice(start)));
    return out;
  }
  return {
    convertCodes, convertPlain, mapping,
    convertText: (s) => cpStr(cc(cpsOf(s))),
    mappingHits: () => mapping.map((e, i) => [e.label, hits[i]]),
  };
}

// ------------------------------------------------------------ glyph packs
const GLYPH_DIM = 16, GLYPH_PIXELS = 256, GLYPH_RAW_BYTES = 64, FOREGROUND = 2, BITMAP_BYTES = 32;
const FONTS = {
  cubic11: { id: 'cubic11', label: 'Cubic 11', url: 'https://github.com/ACh-K/Cubic-11', pack: 'cubic11', latin: 'latin_cubic11', fallback: true },
  fusion: { id: 'fusion', label: 'Fusion Pixel Font 12px', url: 'https://github.com/TakWolf/fusion-pixel-font', pack: 'fusion12', latin: 'latin_fusion12', fallback: false },
};
function fontOf(f) {
  const key = String(f || 'cubic11').toLowerCase();
  const font = FONTS[{ fusion12: 'fusion', 'fusion-pixel': 'fusion', cubic: 'cubic11' }[key] || key];
  if (!font) fail('unsupported', 'glyph font "' + f + '" is not available here (use cubic11 or fusion)');
  return font;
}
function parseGlyphPack(data) {
  if (data.length < 8) fmtErr('glyph pack header');
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  const srcBytes = magic === 'FPG1' ? 24 : magic === 'FPG2' ? 32 : fmtErr('glyph pack header');
  const n = u32(data, 4), codesEnd = 8 + n * 2;
  if (data.length !== codesEnd + n * srcBytes) fmtErr('glyph pack size');
  const codes = new Uint16Array(n);
  for (let i = 0; i < n; i++) codes[i] = u16(data, 8 + i * 2);
  for (let i = 1; i < n; i++) if (codes[i - 1] >= codes[i]) fmtErr('glyph pack not sorted');
  let bitmaps;
  if (srcBytes === 24) {
    bitmaps = new Uint8Array(n * BITMAP_BYTES);
    for (let k = 0; k < n; k++) {
      const s = codesEnd + k * 24, d = k * BITMAP_BYTES;
      for (let y = 0; y < 12; y++) {
        const row = ((data[s + y * 2] << 8) | data[s + y * 2 + 1]) >> 2;
        bitmaps[d + (y + 3) * 2] = row >> 8; bitmaps[d + (y + 3) * 2 + 1] = row & 255;
      }
    }
  } else bitmaps = data.slice(codesEnd);
  return { codes, bitmaps, fallback: null };
}
function withFallback(p, base) {
  const codes = [], parts = [], fallback = [];
  let i = 0, j = 0;
  const bm = (pk, k) => pk.bitmaps.subarray(k * BITMAP_BYTES, (k + 1) * BITMAP_BYTES);
  while (i < p.codes.length || j < base.codes.length) {
    if (j < base.codes.length && (i >= p.codes.length || base.codes[j] < p.codes[i])) {
      codes.push(base.codes[j]); parts.push(bm(base, j)); fallback.push(base.codes[j]); j++;
    } else {
      if (j < base.codes.length && base.codes[j] === p.codes[i]) j++;
      codes.push(p.codes[i]); parts.push(bm(p, i)); i++;
    }
  }
  const bitmaps = new Uint8Array(codes.length * BITMAP_BYTES);
  parts.forEach((b, k) => bitmaps.set(b, k * BITMAP_BYTES));
  return { codes: Uint16Array.from(codes), bitmaps, fallback: new Set(fallback) };
}
const packCache = new Map();
function rawPack(name) {
  if (!packCache.has(name)) {
    const D = zhData();
    const b64 = D.glyphs && D.glyphs[name];
    if (!b64) throw new Error('glyph data ' + name + ' is not loaded (third_party/zh_js/glyphs_*.js)');
    packCache.set(name, parseGlyphPack(fromBase64(b64)));
  }
  return packCache.get(name);
}
function glyphPack(font) {
  const key = 'pack:' + font.id;
  if (!packCache.has(key)) packCache.set(key, makePack(font.fallback ? withFallback(rawPack(font.pack), rawPack('fusion12')) : rawPack(font.pack)));
  return packCache.get(key);
}
function latinPack(font) {
  const key = 'latin:' + font.id;
  if (!packCache.has(key)) packCache.set(key, makePack(rawPack(font.latin)));
  return packCache.get(key);
}
function makePack(p) {
  const slot = (c) => {
    if (c > 0xFFFF) return -1;
    let lo = 0, hi = p.codes.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (p.codes[mid] === c) return mid; if (p.codes[mid] < c) lo = mid + 1; else hi = mid - 1; }
    return -1;
  };
  const bitmap = (c) => { const i = slot(c); return i < 0 ? null : p.bitmaps.subarray(i * BITMAP_BYTES, (i + 1) * BITMAP_BYTES); };
  const render = (c) => {
    const bm = bitmap(c);
    if (!bm) return null;
    const px = new Uint8Array(GLYPH_PIXELS);
    for (let y = 0; y < GLYPH_DIM; y++) for (let x = 0; x < GLYPH_DIM; x++) if (bm[y * 2 + (x >> 3)] & (0x80 >> (x & 7))) px[y * GLYPH_DIM + x] = FOREGROUND;
    return px;
  };
  return {
    size: p.codes.length,
    contains: (c) => slot(c) >= 0,
    isFallback: (c) => !!p.fallback && p.fallback.has(c),
    bitmap, render,
    // Centered in the game's 9 pixel Latin advance (columns 3..11).
    renderLatin(c) {
      const px = render(c);
      if (!px) return null;
      const col = (x) => { for (let y = 0; y < GLYPH_DIM; y++) if (px[y * GLYPH_DIM + x]) return true; return false; };
      let lo = -1, hi = -1;
      for (let x = 0; x < GLYPH_DIM; x++) if (col(x)) { if (lo < 0) lo = x; hi = x; }
      if (lo < 0) return px;
      const width = hi - lo + 1;
      const left = Math.min(3 + ((Math.max(0, 9 - width) + 1) >> 1), Math.max(0, GLYPH_DIM - width));
      const out = new Uint8Array(GLYPH_PIXELS);
      for (let y = 0; y < GLYPH_DIM; y++) for (let x = lo; x <= hi; x++) out[y * GLYPH_DIM + x - lo + left] = px[y * GLYPH_DIM + x];
      return out;
    },
    *bitmaps() { for (let i = 0; i < p.codes.length; i++) yield [p.codes[i], p.bitmaps.subarray(i * BITMAP_BYTES, (i + 1) * BITMAP_BYTES)]; },
  };
}

// ------------------------------------------------------------ font sprite
const F_LZ4 = 1 << 3, F_RLE_BYTE = 1 << 5, F_XOR = 1 << 7, XOR_KEY = 0x53;
const RAW_LZ4_BLOCK = 0x80000000;
const LEGACY_LZ4_TAG = [0x80, 0x80, 0x80, 0x80, 0x50, 0x4C, 0x5A, 0x34];
const CODEC_RLE = 'rle', CODEC_MIXED = 'rle+lz4', CODEC_LZ4 = 'lz4';

function rleDecode(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i++];
    if (c === 0) break;
    if (c & 0x80) { const end = Math.min(i + (c & 0x7F), src.length); for (; i < end; i++) out.push(src[i]); }
    else { if (i >= src.length) break; for (let k = 0; k < c; k++) out.push(src[i]); i++; }
  }
  return out;
}
function lz4DecodeBlock(src, size) {
  const out = new Uint8Array(size);
  let i = 0, o = 0;
  const bad = (m) => { throw new Error(m); };
  for (;;) {
    if (i >= src.length) bad('truncated block');
    const token = src[i++];
    let lit = token >> 4;
    if (lit === 15) { let b; do { if (i >= src.length) bad('truncated length'); b = src[i++]; lit += b; } while (b === 255); }
    if (i + lit > src.length || o + lit > size) bad('literal overrun');
    out.set(src.subarray(i, i + lit), o); i += lit; o += lit;
    if (i === src.length) break;
    if (i + 2 > src.length) bad('truncated offset');
    const off = src[i] | (src[i + 1] << 8); i += 2;
    if (off === 0 || off > o) bad('bad offset');
    let len = token & 15;
    if (len === 15) { let b; do { if (i >= src.length) bad('truncated length'); b = src[i++]; len += b; } while (b === 255); }
    len += 4;
    if (o + len > size) bad('match overrun');
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off];
  }
  return out.subarray(0, o);
}
function unpack2bpp(raw) {
  const px = new Uint8Array(GLYPH_PIXELS);
  for (let i = 0; i < GLYPH_PIXELS; i++) { const b = raw[i >> 2]; if (b !== undefined) px[i] = (b >> ((i & 3) * 2)) & 3; }
  return px;
}
function pack2bpp(px) {
  const raw = new Uint8Array(GLYPH_RAW_BYTES);
  for (let i = 0; i < GLYPH_PIXELS; i++) raw[i >> 2] |= (px[i] & 3) << ((i & 3) * 2);
  return raw;
}
// Smallest byte-RLE stream for one glyph, XORed and padded to 4 bytes.
function encodeRle(raw) {
  const N = GLYPH_RAW_BYTES, cost = new Array(N + 1).fill(0), choice = new Array(N);
  for (let i = N - 1; i >= 0; i--) {
    let best = Infinity, step = [false, 0];
    for (let len = 1; len <= N - i; len++) { const c = 1 + len + cost[i + len]; if (c < best) { best = c; step = [false, len]; } }
    for (let len = 1; len <= N - i; len++) {
      if (raw[i + len - 1] !== raw[i]) break;
      const c = 2 + cost[i + len];
      if (c < best) { best = c; step = [true, len]; }
    }
    cost[i] = best; choice[i] = step;
  }
  const s = [];
  for (let i = 0; i < N;) {
    const [repeat, len] = choice[i];
    if (repeat) s.push(len, raw[i]); else { s.push(0x80 | len); for (let k = 0; k < len; k++) s.push(raw[i + k]); }
    i += len;
  }
  s.push(0);
  for (let k = 0; k < s.length; k++) s[k] ^= XOR_KEY;
  while (s.length % 4) s.push(0);
  return Uint8Array.from(s);
}
// Smallest standard LZ4 block for a 64-byte glyph (not XORed).
function encodeLz4(raw) {
  const N = GLYPH_RAW_BYTES, LAST_LITERALS = 5, LAST_MATCH_START = N - 12, MAX = Infinity;
  const cost = new Array(N + 1).fill(0);
  const bestMatch = Array.from({ length: N }, () => [MAX, 0, 0]);
  const bestStart = new Array(N + 1).fill(N);
  for (let at = N; at >= 0; at--) {
    if (at <= LAST_MATCH_START) {
      const limit = N - LAST_LITERALS - at;
      let longest = 0, offset = 0;
      for (let start = 0; start < at; start++) {
        let len = 0;
        while (len < limit && raw[start + len] === raw[at + len]) len++;
        if (len > longest) { longest = len; offset = at - start; }
        if (longest === limit) break;
      }
      for (let len = 4; len <= longest; len++) {
        const c = 2 + (len >= 19 ? 1 : 0) + cost[at + len];
        if (c < bestMatch[at][0]) bestMatch[at] = [c, offset, len];
      }
    }
    cost[at] = 1 + N - at + (N - at >= 15 ? 1 : 0);
    for (let start = at; start <= LAST_MATCH_START && start < N; start++) {
      const mc = bestMatch[start][0];
      if (mc === MAX) continue;
      const literals = start - at;
      const c = 1 + literals + (literals >= 15 ? 1 : 0) + mc;
      if (c < cost[at]) { cost[at] = c; bestStart[at] = start; }
    }
  }
  const out = [];
  const ext = (len) => { if (len >= 15) out.push(len - 15); };
  let at = 0;
  for (;;) {
    const start = bestStart[at], literals = start - at;
    let offset = 0, matched = 0;
    if (start !== N) { offset = bestMatch[start][1]; matched = bestMatch[start][2] - 4; }
    out.push((Math.min(literals, 15) << 4) | Math.min(matched, 15));
    ext(literals);
    for (let k = at; k < start; k++) out.push(raw[k]);
    if (start === N) break;
    out.push(offset & 255, offset >> 8);
    ext(matched);
    at = start + matched + 4;
  }
  return Uint8Array.from(out);
}

class FontSprite {
  constructor(blob) {
    const h = spriteHeader(blob);
    if (!h) fmtErr('font sprite header');
    const f = h.flags & (F_RLE_BYTE | F_LZ4 | F_XOR);
    if (f === (F_RLE_BYTE | F_XOR)) this.codec = CODEC_RLE;
    else if (f === (F_LZ4 | F_XOR)) this.codec = CODEC_LZ4;
    else fmtErr('font sprite is not encrypted byte-RLE or LZ4');
    if (h.bpp !== 1 || h.width !== 16 || h.height !== 16) fmtErr('font sprite is not 16x16 2bpp');
    const pdo = h.pixelOffset, n = h.numSprites, tableBytes = n * 8;
    if (pdo < 24 || blob.length < pdo + tableBytes) fmtErr('font sprite truncated');
    this.prefix = blob.slice(0, pdo);
    this.payloads = new Array(n);
    this.rawFlags = new Uint8Array(n);
    this.raws = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = pdo + i * 8, stored = u32(blob, o);
      const raw = this.codec === CODEC_LZ4 ? (stored & RAW_LZ4_BLOCK) >>> 0 : 0;
      const off = (stored & 0x7FFFFFFF) >>> 0, rawOff = raw ? off : stored;
      const len = u32(blob, o + 4);
      if (rawOff < tableBytes || rawOff > blob.length - pdo || len > blob.length - pdo - rawOff) fmtErr('glyph ' + i + ' payload out of range');
      this.payloads[i] = blob.subarray(pdo + rawOff, pdo + rawOff + len);
      this.rawFlags[i] = raw ? 1 : 0;
    }
    if (this.codec === CODEC_RLE && this.payloads.some((p) => p.length >= 8 && LEGACY_LZ4_TAG.every((b, k) => (p[k] ^ XOR_KEY) === b))) this.codec = CODEC_MIXED;
    if (this.codec !== CODEC_RLE) for (let i = 0; i < n; i++) if (this.rawGlyph(i).length !== GLYPH_RAW_BYTES) fmtErr('glyph ' + i + ' does not decode to 64 bytes');
    this.originalLength = blob.length;
  }
  get glyphCount() { return this.payloads.length; }
  get usesLegacyLz4() { return this.codec === CODEC_MIXED; }
  rawGlyph(i) {
    if (this.raws[i]) return this.raws[i];
    const stored = this.payloads[i].map((b) => b ^ XOR_KEY);
    let compressed;
    if (this.codec !== CODEC_LZ4) {
      if (!(stored.length >= 8 && LEGACY_LZ4_TAG.every((b, k) => stored[k] === b))) return (this.raws[i] = Uint8Array.from(rleDecode(stored)));
      const block = stored.subarray(8);
      if (block.length < 2 || u16(block, 0) !== GLYPH_RAW_BYTES) fmtErr('invalid legacy LZ4 glyph ' + i + ' size');
      compressed = block.subarray(2);
    } else if (this.rawFlags[i]) {
      if (stored.length !== GLYPH_RAW_BYTES) fmtErr('uncompressed glyph ' + i + ' is not 64 bytes');
      return (this.raws[i] = stored);
    } else compressed = stored;
    let raw;
    try { raw = lz4DecodeBlock(compressed, GLYPH_RAW_BYTES); } catch (e) { fmtErr('invalid LZ4 glyph ' + i + ': ' + e.message); }
    if (raw.length !== GLYPH_RAW_BYTES) fmtErr('LZ4 glyph ' + i + ' decodes to ' + raw.length + ' bytes, expected 64');
    return (this.raws[i] = Uint8Array.from(raw));
  }
  encodeGlyph(raw) {
    if (this.codec === CODEC_RLE) return encodeRle(raw);
    if (this.codec === CODEC_MIXED) {
      const rle = encodeRle(raw), lz4 = encodeLz4(raw);
      if (8 + 2 + lz4.length >= rle.length) return rle;
      return Uint8Array.from([...LEGACY_LZ4_TAG, GLYPH_RAW_BYTES, 0, ...lz4], (b) => b ^ XOR_KEY);
    }
    return encodeLz4(raw).map((b) => b ^ XOR_KEY);
  }
  glyphPixels(i) { return unpack2bpp(this.rawGlyph(i)); }
  isBlank(i) { return this.glyphPixels(i).every((p) => p === 0); }
  setGlyph(i, px) {
    const raw = pack2bpp(px);
    this.raws[i] = raw;
    this.payloads[i] = this.encodeGlyph(raw);
    this.rawFlags[i] = 0;
  }
  // Re-encode and deduplicate every glyph, padded to exactly `targetLen` so later sprite
  // addresses (also those kept by installed menu tools) stay where they were.
  compactToLen(targetLen) {
    const n = this.payloads.length, fixed = this.prefix.length + n * 8;
    const table = [], parts = [], seen = new Map();
    let used = 0;
    for (let i = 0; i < n; i++) {
      const raw = this.rawGlyph(i);
      if (raw.length !== GLYPH_RAW_BYTES) fmtErr('glyph ' + i + ' decodes to ' + raw.length + ' bytes, expected 64');
      const key = bytesKey(raw);
      let entry = seen.get(key);
      if (!entry) {
        const encoded = this.encodeGlyph(raw);
        let payload = encoded, flag = 0;
        if (this.codec !== CODEC_RLE && this.payloads[i].length < encoded.length) { payload = this.payloads[i]; flag = this.rawFlags[i]; }
        entry = { off: used, len: payload.length, flag };
        parts.push([used, payload]);
        used = align4(used + payload.length);
        seen.set(key, entry);
      }
      table.push(entry);
    }
    const minimum = fixed + used;
    if (minimum > targetLen || targetLen >= RAW_LZ4_BLOCK) fail('capacity', 'not enough space: losslessly compressed font needs ' + minimum + ' bytes, but its original extent is ' + targetLen + ' bytes; later sprite addresses cannot be shifted safely');
    const data = new Uint8Array(targetLen - fixed);
    for (const [o, p] of parts) data.set(p, o);
    this.compacted = { table, data };
    return minimum;
  }
  serialize() {
    if (!this.compacted) throw new Error('font must be compacted before serializing');
    const { table, data } = this.compacted, tableBytes = table.length * 8;
    const out = new Uint8Array(this.prefix.length + tableBytes + data.length);
    out.set(this.prefix, 0);
    table.forEach((e, i) => {
      const o = this.prefix.length + i * 8;
      w32(out, o, ((e.off + tableBytes) | (e.flag ? RAW_LZ4_BLOCK : 0)) >>> 0);
      w32(out, o + 4, e.len);
    });
    out.set(data, this.prefix.length + tableBytes);
    w32(out, 0, out.length);
    return out;
  }
}

// ------------------------------------------------------------------- ROM
const ASSET_BASE = 0x111000, MY_LAB_BOOT_ASSET_BASE = 0x51000, MY_LAB_ASSET_BASE = 0x211000, MY_LAB_EDITION = 254;
const ENTRY_DATA = 0, ENTRY_SPRITES = 1, ENTRY_STRINGS = 2, LANGUAGE_COUNT = 9;
const EDITION_NAMES = ['Land', 'Water', 'Sky', 'Jade Forest', 'Tropical', 'Glacier', 'Neon Planets'];
const EDITION_SUMS = [0x70169E2C, 0x70169E2C, 0x70169E2C, 0x849633DB, 0x96CB83B8, 0x96CB83B8, 0x99431749];
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
const SIGNATURE = ascii('SONIXDEV');
const startsWith = (b, at, sig) => at + sig.length <= b.length && sig.every((v, k) => b[at + k] === v);

function detectEdition(bytes) {
  for (const [at, lo, hi] of [[0xD85000, 7, 7], [0xD29000, 4, 6], [0xD49000, 1, 4], [0xEFD000, 1, 7]]) {
    if (at + 0x1000 > bytes.length) continue;
    const id = u32(bytes, at), footer = u32(bytes, at + 0xFF8), inv = u32(bytes, at + 0xFFC);
    if (id < lo || id > hi) continue;
    if (id === 4 && (at === 0xD29000 || at === 0xEFD000) && ((footer + id) >>> 0) === EDITION_SUMS[4] && inv === (~footer >>> 0)) return 5;
    if (id === 4 && at === 0xD29000) continue;
    if (((footer + id) >>> 0) === EDITION_SUMS[id - 1] && inv === (~footer >>> 0)) return id;
  }
  return null;
}
function isMyLab(bytes) {
  return bytes.length === 0x1000000 && startsWith(bytes, 0, SIGNATURE) && u32(bytes, 0x1F8) === 0x5A5A0033 &&
    startsWith(bytes, 0x186A40, SIGNATURE) && startsWith(bytes, 0x18B7B3, ascii('PSID_YD03_MYLAB_CHARA'));
}
function countHanzi(t, cs) {
  let n = 0;
  for (const s of t.strings) for (const c of s) if (cs.isHanziCode(c)) n++;
  return n;
}
function findZhTable(tables, cs, minimum) {
  const counts = tables.map((t) => countHanzi(t, cs));
  if (!counts.length) return null;
  let idx = 0;
  counts.forEach((c, i) => { if (c >= counts[idx]) idx = i; });
  const best = counts[idx];
  if (best < minimum) return null;
  const others = Math.max(0, ...counts.filter((_, i) => i !== idx));
  return others * 4 > best ? null : idx;
}
function findFontSprite(blobs, cs) {
  return blobs.findIndex((b) => { const h = spriteHeader(b); return h && h.numSprites === cs.glyphTotal && h.width === 16 && h.height === 16 && h.bpp === 1; });
}

function loadArchive(bytes, assetBase) {
  const myLab = assetBase !== ASSET_BASE;
  const entryCount = assetBase === MY_LAB_ASSET_BASE ? 24 : 3;
  const region = bytes.subarray(assetBase);
  if (region.length < 4 || u32(region, 0) !== ARC_MAGIC) fail('unsupported', 'unsupported ROM: no ARC2 asset archive at 0x' + assetBase.toString(16));
  const assetLen = arcTotalLen(region);
  if (assetLen > region.length) fmtErr('asset archive extends past end of file');
  const top = arcParse(region);
  if (top.length !== entryCount) fail('unsupported', 'unsupported ROM: expected ' + entryCount + ' top-level archive entries, found ' + top.length);
  const blobs = packParse(top[ENTRY_SPRITES].data);
  const stringsData = top[ENTRY_STRINGS].data;
  const tableFiles = arcParse(stringsData);
  if (tableFiles.length !== LANGUAGE_COUNT) fail('unsupported', 'unsupported ROM: expected 9 string tables, found ' + tableFiles.length);
  const cs = charset();
  const tables = tableFiles.map((f) => tableParse(f.data));
  const zhTable = findZhTable(tables, cs, assetBase === MY_LAB_BOOT_ASSET_BASE ? 100 : 200);
  if (zhTable === null) fail('unsupported', 'unsupported ROM: could not identify the Chinese string table');
  const fontSprite = findFontSprite(blobs, cs);
  if (fontSprite < 0) fail('unsupported', 'unsupported ROM: could not find the CJK font sprite');
  const distinct = new Set();
  for (const s of tables[zhTable].strings) for (const c of s) if (cs.isHanziCode(c)) distinct.add(c);
  const edition = myLab ? MY_LAB_EDITION : detectEdition(bytes);
  return {
    bytes, top, blobs, tableFiles, tables,
    info: {
      romLen: bytes.length, edition, assetBase, assetLen,
      editionName: edition === MY_LAB_EDITION ? 'My Lab' : edition ? EDITION_NAMES[edition - 1] : null,
      topChecksumOk: arcChecksumOk(region), stringsChecksumOk: arcChecksumOk(stringsData),
      spriteCount: blobs.length, fontSprite, fontGlyphs: cs.glyphTotal, zhTable,
      zhStringCount: tables[zhTable].strings.length, zhHanziDistinct: distinct.size,
      signatureOk: startsWith(bytes, 0, SIGNATURE),
    },
  };
}
function loadRom(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length < ASSET_BASE + 64) fail('unsupported', 'unsupported ROM: file is too small to be a Paradise ROM');
  return loadArchive(bytes, isMyLab(bytes) ? MY_LAB_ASSET_BASE : ASSET_BASE);
}
function loadMyLabBoot(bytes) {
  if (!isMyLab(bytes)) fail('unsupported', 'unsupported ROM: expected a My Lab ROM');
  return loadArchive(bytes, MY_LAB_BOOT_ASSET_BASE);
}
const loadMatching = (rom, bytes) => rom.info.assetBase === MY_LAB_BOOT_ASSET_BASE ? loadMyLabBoot(bytes) : loadRom(bytes);
const fontOfRom = (rom) => new FontSprite(rom.blobs[rom.info.fontSprite]);
function extraLanguageTables(rom) {
  const out = [];
  for (const entry of rom.top.slice(3)) for (const pkg of arcParse(entry.data)) {
    const files = arcParse(pkg.data);
    if (!files[ENTRY_STRINGS]) fmtErr('missing string archive in My Lab package');
    for (const t of arcParse(files[ENTRY_STRINGS].data)) out.push(tableParse(t.data));
  }
  return out;
}
const otherAssets = (rom) => rom.top.filter((_, i) => i !== ENTRY_SPRITES && i !== ENTRY_STRINGS);

// Installed Paramix menu catalogs may hold absolute sprite addresses.
function usesSpriteAddresses(bytes) {
  for (let off = 0x90000; off < 0x110000; off += 0x1000) {
    const c = off + 0x140, ptr = u32At(bytes, c + 272);
    if (u32At(bytes, c) === 0x444C4546 && ptr !== null && ptr !== 0) return true;
  }
  return false;
}

// Rebase the external Paramix SIXB rain cell pointers after the sprite pack moved.
function sixRainRelocate(original, archive) {
  const HELPER = 0x10F000, REGION = 0xF00000, REGION_END = 0xFF0000, CELLS = 64, RECORD = 4 + CELLS * 4;
  const sites = new Map();
  if (!startsWith(original, HELPER, ascii('SIX1')) || !startsWith(original, REGION, ascii('SIXB'))) return sites;
  const bad = () => fmtErr('invalid Paramix SIXB rain relocation table');
  const read = (d, at) => { const v = u32At(d, at); return v === null ? bad() : v; };
  const count = read(original, REGION + 4), externalEnd = Math.min(REGION_END, original.length);
  if (count === 0 || count > Math.floor((externalEnd - REGION - 8) / RECORD) || ASSET_BASE + archive.length > REGION) bad();
  const dataStart = REGION + 8 + count * RECORD;
  const packStart = read(archive, 36), packLen = read(archive, 44), packEnd = packStart + packLen;
  if (packStart < 64 || packEnd > archive.length || packLen < 4) bad();
  let spriteCount = read(archive, packStart);
  if (spriteCount === 0 || spriteCount % 4 || spriteCount > packLen) bad();
  spriteCount /= 4;
  const originalCount = read(original, HELPER + 16);
  for (let i = 0; i < count; i++) {
    const record = REGION + 8 + i * RECORD, index = read(original, record);
    if (index < originalCount || index >= spriteCount || sites.has(index)) bad();
    const offset = read(archive, packStart + index * 4);
    const end = index + 1 === spriteCount ? packLen : read(archive, packStart + (index + 1) * 4);
    if (offset < spriteCount * 4 || offset > end || end > packLen) bad();
    const start = packStart + offset;
    const h = spriteHeader(archive.subarray(start, packStart + end));
    if (!h) bad();
    const pixels = h.pixelOffset;
    if (h.numSprites !== CELLS || pixels < 24 || pixels + 8 * CELLS > end - offset) bad();
    const pointers = [];
    for (let cell = 0; cell < CELLS; cell++) {
      const rel = read(original, record + 4 + cell * 4);
      if (rel === 0xFFFFFFFF) continue;
      const target = dataStart + rel, at = start + pixels + cell * 8, len = read(archive, at + 4);
      if (len === 0 || target >= externalEnd || len > externalEnd - target) bad();
      w32(archive, at, target - (ASSET_BASE + start + pixels));
      pointers.push(at - start);
    }
    sites.set(index, pointers);
  }
  w32(archive, 4, arcChecksum(archive));
  return sites;
}

// Rebuilds the asset archive in place of the old one and returns the full ROM image.
function romToBytes(rom, tables, font) {
  const top = rom.top.map((f) => ({ flags: f.flags, data: f.data }));
  const tableFiles = rom.tableFiles.map((f, i) => ({ flags: f.flags, data: tables ? tableSerialize(tables[i]) : f.data }));
  const blobs = rom.blobs.slice();
  if (font) blobs[rom.info.fontSprite] = font.serialize();
  top[ENTRY_STRINGS].data = arcBuild(tableFiles);
  top[ENTRY_SPRITES].data = packBuild(blobs);
  const asset = arcBuild(top);
  const out = rom.bytes.slice();
  const base = rom.info.assetBase, oldEnd = base + rom.info.assetLen, newEnd = base + asset.length;
  if (newEnd > out.length) fail('capacity', 'not enough space: patched assets would exceed the ROM size');
  const free = rom.info.edition === MY_LAB_EDITION ? 0 : 0xFF;
  if (newEnd > oldEnd) {
    // Only grow into the erased rest of the last archive page: later pages may be
    // reserved by menu tools even while they are empty.
    if (free === 0xFF && newEnd > ((oldEnd + 0xFFF) & ~0xFFF)) fail('capacity', 'not enough space: patched assets would grow into the next flash page; shorten the mapped text');
    for (let i = oldEnd; i < newEnd; i++) if (out[i] !== free) fail('capacity', 'not enough space: patched assets would overwrite non-empty flash after the archive');
  }
  if (base === ASSET_BASE) sixRainRelocate(rom.bytes, asset);
  out.set(asset, base);
  if (newEnd < oldEnd) out.fill(free, newEnd, oldEnd);
  return { bytes: out, assetLen: asset.length };
}

// ------------------------------------------------------------ language row
const ZH_PAREN_OPEN = 181, ZH_PAREN_CLOSE = 182;
const CP = (s) => s.codePointAt(0);
function languageNameIndex(tables, zh, cs) {
  const codes = ['中', '文', '简', '体'].map((c) => cs.codeOf(CP(c)));
  if (codes.some((c) => c === null)) return null;
  const name = [codes[0], codes[1], ZH_PAREN_OPEN, codes[2], codes[3], ZH_PAREN_CLOSE, 0];
  const i = tables[zh].strings.findIndex((row, i) => arrEqual(row, name) && tables.every((t) => arrEqual(t.strings[i], row)));
  return i < 0 ? null : i;
}
function relabelTraditional(name, cs, font) {
  const from = cs.codeOf(CP('简')), to = cs.codeOf(CP('繁'));
  if (from === null || to === null || font.isBlank(glyphOfCode(to))) return;
  for (let k = 0; k < name.length; k++) if (name[k] === from) name[k] = to;
}
function alreadyTraditional(tables, zh, cs) {
  const trad = cs.codeOf(CP('繁'));
  if (trad === null) return false;
  return tables[zh].strings.some((row, i) => row.length === 7 && row[2] === ZH_PAREN_OPEN && row[3] === trad &&
    row[5] === ZH_PAREN_CLOSE && row[6] === 0 && tables.every((t) => arrEqual(t.strings[i], row)));
}
const simplifiedOnly = (cp) => !traditionalEncodable(cp);

// ------------------------------------------------------------------ plan
function codesUsed(tables) {
  const set = new Set();
  for (const t of tables) for (const s of t.strings) for (const c of s) set.add(c);
  return set;
}
function emptyStats(total) {
  return { stringsTotal: total, stringsChanged: 0, charsChanged: 0, charsConverted: 0, reusedCodes: 0,
    reskinned: 0, restyled: 0, overflow: 0, restyleSkipped: 0, unidentifiedGlyphs: 0 };
}
function buildPlan({ cs, pack, zh, others, restyleShared }, conv) {
  const converted = zh.strings.map((s, i) => conv.convertCodes(i + 1, s));
  const needs = new Map(); // target -> Map(source code -> count)
  const directOutputs = new Map();
  const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
  for (const tokens of converted) for (const t of tokens) {
    if (t.target === null) continue;
    if (t.code === INSERTED) { if (!needs.has(t.target)) needs.set(t.target, new Map()); bump(needs.get(t.target), INSERTED); continue; }
    const src = cs.charOfCode(t.code);
    const code = cs.codeOf(t.target);
    if (t.target === src) bump(directOutputs, t.code);
    else if (code !== null) bump(directOutputs, code);
    else { if (!needs.has(t.target)) needs.set(t.target, new Map()); bump(needs.get(t.target), t.code); }
  }
  const needTargets = [...needs.keys()].sort(numSort);
  const srcCodes = (target) => [...needs.get(target).keys()].sort(numSort);

  const protectedCodes = codesUsed(others);
  for (const k of directOutputs.keys()) protectedCodes.add(k);
  for (const target of needTargets) if (!pack.contains(target)) for (const c of needs.get(target).keys()) protectedCodes.add(c);
  const allUsed = new Set(protectedCodes);
  for (const c of codesUsed([zh])) allUsed.add(c);

  const assigned = new Map(), edits = [], unresolved = [], claimed = new Set();
  const bySource = new Map();
  for (const target of needTargets) {
    if (!pack.contains(target)) continue;
    for (const code of srcCodes(target)) {
      if (code === INSERTED) continue;
      if (!bySource.has(code)) bySource.set(code, []);
      bySource.get(code).push([target, needs.get(target).get(code)]);
    }
  }
  const sourceOrder = [...bySource.keys()].sort(numSort).map((code) => [code, bySource.get(code)]);
  for (const [, v] of sourceOrder) v.sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]));
  const total = (v) => v.reduce((s, x) => s + x[1], 0);
  sourceOrder.sort((a, b) => (total(b[1]) - total(a[1])) || (a[0] - b[0]));
  for (const [code, targets] of sourceOrder) {
    const src = cs.charOfCode(code);
    if (protectedCodes.has(code) || claimed.has(code) || !cs.isHanziCode(code) || traditionalEncodable(src)) continue;
    const pick = targets.find(([t]) => !assigned.has(t));
    if (pick) { assigned.set(pick[0], code); claimed.add(code); edits.push({ code, ch: pick[0], kind: 'reskin' }); }
  }

  const pool = [];
  for (let i = 0; i < cs.hangulEnd; i++) { const code = CODE_BASE + i; if (!allUsed.has(code) && !claimed.has(code)) pool.push(code); }
  for (let i = cs.hanziStart; i < cs.len; i++) {
    const code = CODE_BASE + i;
    if (!allUsed.has(code) && !claimed.has(code) && !traditionalEncodable(cs.charOfCode(code))) pool.push(code);
  }
  let poolAt = 0;
  const nextSlot = () => poolAt < pool.length ? pool[poolAt++] : null;

  for (const target of needTargets) {
    if (assigned.has(target)) continue;
    const srcs = needs.get(target);
    const count = total([...srcs.entries()]);
    let first = target;
    for (const c of srcCodes(target)) { const ch = cs.charOfCode(c); if (ch !== null) { first = ch; break; } }
    if (!pack.contains(target)) { unresolved.push({ source: first, target, count, reason: 'no glyph available' }); continue; }
    const code = nextSlot();
    if (code !== null) { assigned.set(target, code); edits.push({ code, ch: target, kind: 'overflow' }); }
    else unresolved.push({ source: first, target, count, reason: 'no free glyph slot' });
  }

  const moved = new Map();
  let restyleSkipped = 0;
  if (restyleShared) {
    const usedElsewhere = codesUsed(others);
    const shared = [...directOutputs.entries()].filter(([code]) => cs.isHanziCode(code)).sort((a, b) => a[0] - b[0]);
    shared.sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]));
    for (const [code] of shared) {
      const ch = cs.charOfCode(code);
      if (!pack.contains(ch)) continue;
      if (!usedElsewhere.has(code)) edits.push({ code, ch, kind: 'restyle' });
      else {
        const slot = nextSlot();
        if (slot !== null) { moved.set(code, slot); edits.push({ code: slot, ch, kind: 'overflow' }); }
        else restyleSkipped++;
      }
    }
  }
  const remap = (c) => moved.has(c) ? moved.get(c) : c;
  const stats = emptyStats(zh.strings.length);
  stats.restyleSkipped = restyleSkipped;
  const QUESTION = latinCode(0x3F);
  const outStrings = zh.strings.map((orig, si) => {
    const out = [];
    let changed = false;
    for (const t of converted[si]) {
      let code;
      if (t.target === null) code = t.code;
      else if (t.code === INSERTED) code = assigned.has(t.target) ? assigned.get(t.target) : QUESTION;
      else {
        const src = cs.charOfCode(t.code), c = cs.codeOf(t.target);
        if (t.target === src) code = remap(t.code);
        else if (c !== null) { stats.reusedCodes++; code = remap(c); }
        else if (assigned.has(t.target)) code = assigned.get(t.target);
        else code = t.code;
      }
      if (code !== t.code) { changed = true; stats.charsChanged++; }
      if (t.target !== null && cs.charOfCode(t.code) !== t.target) stats.charsConverted++;
      out.push(code);
    }
    if (changed || !arrEqual(out, orig)) stats.stringsChanged++;
    return out;
  });
  stats.reskinned = edits.filter((e) => e.kind === 'reskin').length;
  stats.restyled = edits.filter((e) => e.kind === 'restyle').length;
  stats.overflow = edits.filter((e) => e.kind === 'overflow').length;
  edits.sort((a, b) => a.code - b.code);
  return { table: { strings: outStrings }, edits, unresolved, stats };
}

// An earlier patch stores Traditional characters in reused slots. Recover them
// by exact bitmap match against the bundled fonts.
let knownTraditionalBitmaps;
function traditionalCodePoint(font, cs, code) {
  if (!knownTraditionalBitmaps) {
    knownTraditionalBitmaps = new Map();
    for (const f of Object.values(FONTS)) for (const [ch, bitmap] of glyphPack(f).bitmaps()) {
      const key = bytesKey(bitmap);
      if (!knownTraditionalBitmaps.has(key)) knownTraditionalBitmaps.set(key, new Set());
      knownTraditionalBitmaps.get(key).add(ch);
    }
  }
  const pixels = font.glyphPixels(glyphOfCode(code)), mask = new Uint8Array(32);
  for (let i = 0; i < GLYPH_PIXELS; i++) {
    if (pixels[i] === FOREGROUND) mask[i >> 3] |= 0x80 >> (i & 7);
    else if (pixels[i] !== 0) return null;
  }
  const chars = knownTraditionalBitmaps.get(bytesKey(mask));
  const own = cs.charOfCode(code);
  if (own !== null && chars?.has(own)) return own;
  return chars?.size === 1 ? chars.values().next().value : null;
}

function romTraditionalGlyph(input, { boot = false } = {}) {
  const rom = boot ? loadMyLabBoot(input) : loadRom(input);
  const cs = charset();
  if (!alreadyTraditional(rom.tables, rom.info.zhTable, cs)) return null;
  const font = fontOfRom(rom), cache = new Map();
  return code => {
    if (!cs.isHanziCode(code) && !cs.isHangulCode(code)) return null;
    if (!cache.has(code)) {
      const cp = traditionalCodePoint(font, cs, code);
      cache.set(code, cp === null ? null : String.fromCodePoint(cp));
    }
    return cache.get(code);
  };
}

function restyleConverted(zh, cs, font, pack, redraw) {
  const edits = [], stats = emptyStats(zh.strings.length);
  if (redraw) {
    const codes = [...new Set(zh.strings.flat().filter((c) => cs.isHanziCode(c) || cs.isHangulCode(c)))].sort(numSort);
    for (const code of codes) {
      const ch = traditionalCodePoint(font, cs, code);
      if (ch !== null && pack.contains(ch)) edits.push({ code, ch, kind: 'restyle' });
      else stats.unidentifiedGlyphs++;
    }
  }
  stats.restyled = edits.length;
  return { table: tableClone(zh), edits, unresolved: [], stats };
}

// Settings > Language, My Lab v1.0.00. Firmware signatures and helper code
// from x43x61x69/tamagotchi-paradise-zh-patcher, my_lab_language.rs (MIT).
const labHex = text => Uint8Array.from(text.split(' '), byte => parseInt(byte, 16));
const LAB_XIP = 0x111000, LAB_LANGUAGE_PAGE = 0x1ff000;
const LAB_MENU = labHex('47 00 00 00 5f 00 00 00 48 00 00 00 60 00 00 00 49 00 00 00 5a 00 00 00 4a 00 00 00 21 00 00 00');
const LAB_CODE = labHex('00 8c 42 1c 92 b2 2a b9 08 48 80 88 32 28 01 d1 00 f0 02 b8 3b f7 9a be 04 48 81 88 32 29 01 d1 32 21 41 80 02 98 00 68 3b f7 a6 be 08 17 00 18 07 4a 92 88 32 2a 09 d1 06 4a 12 68 12 f0 04 0f 04 d0 4f f6 ff 72 0a 80 01 20 70 47 31 f7 7e bd 08 17 00 18 3c 17 00 18');
const LAB_ANCHORS = [
  [0x78934, LAB_MENU],
  [0x29d8c, labHex('40 f2 74 60 c1 f6 00 00 b0 f8 76 10 02 f0 0f 02 21 f4 f0 51 41 ea 42 21 a0 f8 76 10 b0 f8 76 00 c0 f3 43 20 17 f0 14 fb')],
  [0x4510c, labHex('02 98 80 88 61 28 0e d0 ff e7 41 f2 08 70 c1 f6 00 00 00 88 10 21 cc f7 b1 fd 20 b1 ff e7 00 20 23 f0 f5 fc')],
];
const LAB_EDITS = [
  [0x37b44, labHex('48 f6 34 11 c1 f2 07 01'), labHex('4e f2 10 01 c1 f2 0e 01')],
  [0x37b4e, labHex('04 21'), labHex('05 21')],
  [0x37bee, labHex('03 28'), labHex('04 28')],
  [0x37bfa, labHex('48 f6 34 11 c1 f2 07 01'), labHex('4e f2 10 01 c1 f2 0e 01')],
  [0x37ccc, labHex('48 f6 34 10 c1 f2 07 00'), labHex('4e f2 10 00 c1 f2 0e 00')],
  [0x29d74, labHex('f5 f7 0a ff'), labHex('c4 f0 7c f9')],
  [0x29d88, labHex('00 8c 42 1c'), labHex('c4 f0 5a b9')],
  [0x29db4, labHex('02 98 00 68'), labHex('c4 f0 50 b9')],
];

function labLanguagePage(label) {
  const page = new Uint8Array(0x1000).fill(0xff);
  page.set(new TextEncoder().encode('ZHLAB001'));
  w32(page, 8, label);
  page.set(LAB_MENU, 0x10);
  w32(page, 0x30, label);
  w32(page, 0x34, 0x66);
  page.set(LAB_CODE, 0x40);
  return page;
}

function labLanguageStatus(rom) {
  const { bytes, tables } = rom;
  const matches = (offset, pattern) => bytesEqual(pattern, bytes.subarray(LAB_XIP + offset, LAB_XIP + offset + pattern.length));
  if (!LAB_ANCHORS.every(([offset, pattern]) => matches(offset, pattern))) return 'unsupported';
  const page = bytes.subarray(LAB_LANGUAGE_PAGE, LAB_LANGUAGE_PAGE + 0x1000);
  const label = u32(page, 8);
  if (label < 0xffff && LAB_EDITS.every(([offset,, after]) => matches(offset, after)) && bytesEqual(page, labLanguagePage(label))) {
    if (tables.some(table => label >= table.strings.length)) fail('unsupported', 'My Lab Settings refers to a missing language label');
    return 'installed';
  }
  return tables.length === 9 && tables.every(t => t.strings.length === tables[0].strings.length) &&
    LAB_EDITS.every(([offset, before]) => matches(offset, before)) && page.every(b => b === 0xff) ? 'available' : 'unsupported';
}

// Prepare the exact changes permitted outside the translated text and font.
// The verifier independently constructs this baseline from the original ROM.
function withLabLanguage(rom) {
  const cs = charset(), label = rom.tables[0].strings.length;
  const words = ['げんご', 'language', 'langue', 'sprache', 'idioma', 'idioma', 'lingua', '语言', '언어'];
  const tables = rom.tables.map((table, i) => {
    // Firmware menu labels use the lowercase alphabet at ASCII + 221.
    let codes = cpsOf(words[i]).map(cp => cp < 128 ? cp + 221 : cs.codeOf(cp));
    if (codes.includes(null)) codes = cpsOf('language').map(cp => cp + 221);
    const result = { strings: [...table.strings, [...codes, 0]] };
    if (!tableFitsU16(result)) fail('capacity', 'My Lab Settings label exceeds string table capacity');
    return result;
  });
  const bytes = new Uint8Array(rom.bytes);
  for (const [offset,, after] of LAB_EDITS) bytes.set(after, LAB_XIP + offset);
  bytes.set(labLanguagePage(label), LAB_LANGUAGE_PAGE);
  return { ...rom, bytes, tables };
}

// ----------------------------------------------------------------- patch
function normalizeOptions(o = {}) {
  return {
    variant: variantOf(o.variant),
    font: fontOf(o.font),
    redrawShared: o.redrawShared !== false && o.keepSharedGlyphs !== true,
    redrawLatin: o.redrawLatin !== false && o.keepLatinGlyphs !== true,
    mapping: parseMapping(o.mapping),
    onProgress: typeof o.onProgress === 'function' ? o.onProgress : () => {},
  };
}

function patchArchive(rom, opts) {
  const cs = charset(), pack = glyphPack(opts.font), info = rom.info, progress = opts.onProgress;
  progress('Loading conversion dictionaries');
  const conv = makeConverter(opts.variant, opts.mapping, cs);
  progress('Reading string tables');
  const tables = rom.tables.map(tableClone);
  const font = fontOfRom(rom);
  const nameIndex = languageNameIndex(tables, info.zhTable, cs);
  if (nameIndex !== null) relabelTraditional(tables[info.zhTable].strings[nameIndex], cs, font);
  const zh = tables[info.zhTable];
  const extra = extraLanguageTables(rom);
  const others = tables.filter((_, i) => i !== info.zhTable).concat(extra);

  progress('Converting text and planning glyphs');
  const repatch = (font.usesLegacyLz4 || info.edition === MY_LAB_EDITION) && alreadyTraditional(tables, info.zhTable, cs);
  if (repatch && opts.mapping.length) fail('unsupported', 'unsupported ROM: text mappings need the pre-translation ROM because an existing patch reuses glyph codes; font changes can use this ROM directly');
  const plan = repatch ? restyleConverted(zh, cs, font, pack, opts.redrawShared)
    : buildPlan({ cs, pack, zh, others, restyleShared: opts.redrawShared }, conv);
  if (!tableFitsU16(plan.table)) fail('capacity', 'not enough space: converted string table exceeds 64K words');

  progress('Drawing glyphs');
  for (const e of plan.edits) {
    const px = pack.render(e.ch);
    if (!px) fmtErr('missing glyph for ' + String.fromCodePoint(e.ch));
    font.setGlyph(glyphOfCode(e.code), px);
  }
  const latinGlyphs = [];
  if (opts.redrawLatin) {
    const latin = latinPack(opts.font);
    for (let c = 0x21; c <= 0x7A; c++) {
      const code = latinCode(c);
      if (code === null) continue;
      const px = latin.renderLatin(c);
      if (!px) fmtErr('missing Latin glyph for ' + String.fromCharCode(c));
      font.setGlyph(glyphOfCode(code), px);
      latinGlyphs.push(glyphOfCode(code));
    }
  }

  progress('Compressing glyphs');
  const fontMinimum = font.compactToLen(rom.blobs[info.fontSprite].length);

  progress('Rebuilding assets');
  const newTables = tables.map((t, i) => {
    if (i === info.zhTable) return plan.table;
    if (nameIndex !== null) { const c = tableClone(t); c.strings[nameIndex] = plan.table.strings[nameIndex].slice(); return c; }
    return t;
  });
  const built = romToBytes(rom, newTables, font);
  const bytes = built.bytes;

  const remaining = new Map();
  plan.table.strings.forEach((s) => {
    if (repatch) return;
    for (const c of s) if (cs.isHanziCode(c)) { const ch = cs.charOfCode(c); if (simplifiedOnly(ch)) remaining.set(ch, (remaining.get(ch) || 0) + 1); }
  });
  const reskinned = new Set(plan.edits.map((e) => e.code));
  const remainingSimplified = [...remaining.entries()].sort((a, b) => a[0] - b[0])
    .filter(([ch]) => { const code = cs.codeOf(ch); return code === null || !reskinned.has(code); })
    .map(([ch, count]) => ({ char: String.fromCodePoint(ch), count }));

  const report = {
    archive: info.assetBase === MY_LAB_BOOT_ASSET_BASE ? 'my-lab-startup' : info.edition === MY_LAB_EDITION ? 'my-lab' : 'paradise',
    variant: opts.variant.id, variantLabel: opts.variant.label, font: opts.font.id, fontLabel: opts.font.label,
    repatch, stats: plan.stats,
    edits: plan.edits.map((e) => ({ code: e.code, char: String.fromCodePoint(e.ch), kind: e.kind })),
    unresolved: plan.unresolved.map((u) => ({ source: String.fromCodePoint(u.source), target: String.fromCodePoint(u.target), count: u.count, reason: u.reason })),
    remainingSimplified,
    assetLenBefore: info.assetLen, assetLenAfter: built.assetLen,
    fontBytesNeeded: fontMinimum, fontBytes: rom.blobs[info.fontSprite].length,
    fallbackGlyphs: plan.edits.filter((e) => pack.isFallback(e.ch)).length,
    latinGlyphs: latinGlyphs.length,
    mappingHits: conv.mappingHits().map(([key, count]) => ({ key, count })),
    runtimeLanguage: 'not-included',
    startup: null,
  };

  progress('Verifying output');
  const after = loadMatching(rom, bytes);
  const issues = verifyArchive(rom, after, opts.mapping.length ? opts.mapping : null);
  const allowed = new Set(plan.edits.map((e) => glyphOfCode(e.code)).concat(latinGlyphs));
  const stray = changedGlyphs(rom, after).filter((g) => !allowed.has(g)).length;
  if (stray) issues.push(stray + ' unplanned glyphs changed');
  if (issues.length) fail('verify', 'verification failed: ' + issues.join('; '));
  return { bytes, report };
}

function patch(input, options) {
  const opts = normalizeOptions(options);
  const rom = loadRom(new Uint8Array(input));
  const menu = rom.info.assetBase === MY_LAB_ASSET_BASE ? labLanguageStatus(rom) : 'not-included';
  const addLanguage = menu === 'available' && options?.runtimeLanguage !== false;
  const out = patchArchive(addLanguage ? withLabLanguage(rom) : rom, opts);
  out.report.runtimeLanguage = addLanguage ? 'added' : menu;
  if (rom.info.assetBase === MY_LAB_ASSET_BASE) {
    opts.onProgress('Patching My Lab startup assets');
    const boot = loadMyLabBoot(out.bytes);
    const startup = patchArchive(boot, Object.assign({}, opts, { mapping: [] }));
    out.bytes = startup.bytes;
    out.report.startup = startup.report;
  }
  return { rom: out.bytes, report: out.report, fileSuffix: opts.variant.suffix };
}

// ---------------------------------------------------------------- verify
function changedGlyphs(a, b) {
  const fa = fontOfRom(a), fb = fontOfRom(b), out = [];
  for (let i = 0; i < Math.min(fa.glyphCount, fb.glyphCount); i++) if (!bytesEqual(fa.rawGlyph(i), fb.rawGlyph(i)) && !bytesEqual(fa.glyphPixels(i), fb.glyphPixels(i))) out.push(i);
  return out;
}
function verifyArchive(a, b, mapping) {
  const original = a.bytes, patched = b.bytes, cs = charset(), issues = [], ia = a.info, ib = b.info;
  if (original.length !== patched.length) issues.push('ROM size changed');
  if (!ib.topChecksumOk || !ib.stringsChecksumOk) issues.push('archive checksum mismatch');
  if (ia.assetBase !== ib.assetBase) { issues.push('asset archive location changed'); return issues; }
  const ta = a.tables, tb = b.tables, head = ia.assetBase;
  if (!bytesEqual(original.subarray(0, head), patched.subarray(0, head))) issues.push('data before the asset archive changed');
  const tail = Math.min(ia.assetBase + Math.max(ia.assetLen, ib.assetLen), original.length);
  if (original.length === patched.length && !bytesEqual(original.subarray(tail), patched.subarray(tail))) issues.push('data after the asset archive changed');
  if (ia.zhTable !== ib.zhTable || ia.fontSprite !== ib.fontSprite) issues.push('table or font location changed');
  if (usesSpriteAddresses(original) && a.blobs[ia.fontSprite].length !== b.blobs[ib.fontSprite].length) issues.push('font extent changed with an installed Paramix catalog');
  const oa = otherAssets(a), ob = otherAssets(b);
  if (oa.length !== ob.length || oa.some((f, i) => f.flags !== ob[i].flags || !bytesEqual(f.data, ob[i].data))) issues.push('unrelated asset archive entries changed');
  if (ia.spriteCount !== ib.spriteCount) issues.push('sprite count changed');
  let rainSites = new Map();
  if (ia.edition !== MY_LAB_EDITION) {
    const archive = patched.subarray(ib.assetBase, ib.assetBase + ib.assetLen), repaired = archive.slice();
    rainSites = sixRainRelocate(original, repaired);
    if (rainSites.size && !bytesEqual(repaired, archive)) issues.push('external SIXB rain pointers do not match the rebuilt archive');
  }
  a.blobs.forEach((x, i) => {
    const y = b.blobs[i];
    if (i === ia.fontSprite || !y || bytesEqual(x, y)) return;
    const expected = x.slice();
    for (const at of rainSites.get(i) || []) if (at + 4 <= expected.length && at + 4 <= y.length) expected.set(y.subarray(at, at + 4), at);
    if (!bytesEqual(expected, y)) issues.push('sprite ' + i + ' changed');
  });
  const nameIndex = languageNameIndex(ta, ia.zhTable, cs);
  ta.forEach((x, i) => {
    if (i === ia.zhTable) return;
    const y = tb[i];
    const same = y.strings.length === x.strings.length && x.strings.every((s, k) => arrEqual(s, y.strings[k]) ||
      (nameIndex === k && arrEqual(tb[ib.zhTable].strings[k], y.strings[k])));
    if (!same) issues.push('string table ' + i + ' changed');
  });
  const za = ta[ia.zhTable], zb = tb[ib.zhTable];
  if (zb.strings.length !== za.strings.length) issues.push('string count changed');
  else za.strings.forEach((x, i) => {
    if (mapping && mappingAppliesTo(mapping, cs, x, i + 1)) return;
    const y = zb.strings[i];
    if (x.length !== y.length) { issues.push('string ' + (i + 1) + ' length changed'); return; }
    for (let k = 0; k < x.length; k++) {
      const p = x[k], q = y[k];
      if (p !== q && !(cs.isHanziCode(p) && (cs.isHanziCode(q) || cs.isHangulCode(q)))) { issues.push('string ' + (i + 1) + ' changed a non-hanzi code'); break; }
    }
  });
  const fb = fontOfRom(b);
  if (fb.glyphCount !== cs.glyphTotal) issues.push('font glyph count changed');
  const blankUsed = new Set();
  for (const s of zb.strings) for (const c of s) if ((cs.isHanziCode(c) || cs.isHangulCode(c)) && fb.isBlank(glyphOfCode(c))) blankUsed.add(c);
  if (blankUsed.size) issues.push(blankUsed.size + ' used hanzi codes have blank glyphs');
  return issues;
}
/** Problems found when comparing a patched ROM with its original (empty list = fine). */
function verify(original, patched, mapping) {
  original = original instanceof Uint8Array ? original : new Uint8Array(original);
  patched = patched instanceof Uint8Array ? patched : new Uint8Array(patched);
  const entries = mapping ? parseMapping(mapping) : null;
  const a = loadRom(original);
  let b;
  try { b = loadRom(patched); } catch (e) { return ['patched ROM does not parse: ' + e.message]; }
  if (a.info.assetBase === MY_LAB_ASSET_BASE && b.info.assetBase === MY_LAB_ASSET_BASE) {
    const ob = loadMyLabBoot(original);
    let pb;
    try { pb = loadMyLabBoot(patched); } catch (e) { return ['patched My Lab startup archive does not parse: ' + e.message]; }
    const end = MY_LAB_BOOT_ASSET_BASE + Math.max(ob.info.assetLen, pb.info.assetLen);
    const mainOnly = new Uint8Array(patched);
    mainOnly.set(original.subarray(MY_LAB_BOOT_ASSET_BASE, end), MY_LAB_BOOT_ASSET_BASE);
    const main = loadRom(mainOnly);
    const expected = labLanguageStatus(a) === 'available' && labLanguageStatus(main) === 'installed' ? withLabLanguage(a) : a;
    return verifyArchive(expected, main, entries).concat(verifyArchive(loadMyLabBoot(mainOnly), pb, null));
  }
  return verifyArchive(a, b, entries);
}

// --------------------------------------------------------------- inspect
function inspectArchive(rom) {
  const cs = charset(), info = rom.info, zh = rom.tables[info.zhTable];
  const font = fontOfRom(rom);
  const simplified = new Map();
  for (const s of zh.strings) for (const c of s) if (cs.isHanziCode(c)) {
    const ch = cs.charOfCode(c);
    if (simplifiedOnly(ch)) simplified.set(ch, (simplified.get(ch) || 0) + 1);
  }
  const traditional = alreadyTraditional(rom.tables, info.zhTable, cs);
  const nameIndex = languageNameIndex(rom.tables, info.zhTable, cs);
  return {
    archive: info.assetBase === MY_LAB_BOOT_ASSET_BASE ? 'my-lab-startup' : info.edition === MY_LAB_EDITION ? 'my-lab' : 'paradise',
    assetBase: info.assetBase, assetLen: info.assetLen,
    checksumsOk: info.topChecksumOk && info.stringsChecksumOk,
    zhTable: info.zhTable, zhStrings: info.zhStringCount, zhHanziDistinct: info.zhHanziDistinct,
    simplifiedDistinct: simplified.size,
    simplifiedSample: [...simplified.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 12).map(([c]) => String.fromCodePoint(c)).join(''),
    fontCodec: font.codec, fontGlyphs: font.glyphCount, fontBytes: rom.blobs[info.fontSprite].length,
    languageRow: nameIndex !== null ? nameIndex + 1 : null,
    alreadyTraditional: traditional,
    needsConversion: !traditional && simplified.size > 0,
  };
}
/**
 * What the converter sees in a ROM. `needsConversion` is true when the Chinese text is
 * still Simplified; `alreadyTraditional` when an earlier conversion renamed the Chinese
 * language entry. Never throws for unsupported files: `supported` is false with `reason`.
 */
function inspect(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    const rom = loadRom(bytes);
    const archives = [inspectArchive(rom)];
    if (rom.info.assetBase === MY_LAB_ASSET_BASE) archives.push(inspectArchive(loadMyLabBoot(bytes)));
    const needsConversion = archives.some((a) => a.needsConversion);
    const alreadyTraditional = archives.every((a) => a.alreadyTraditional);
    return {
      supported: true,
      kind: rom.info.edition === MY_LAB_EDITION ? 'my-lab' : 'paradise',
      edition: rom.info.edition, editionName: rom.info.editionName,
      signatureOk: rom.info.signatureOk,
      checksumsOk: archives.every((a) => a.checksumsOk),
      archives, needsConversion, alreadyTraditional,
      fontGrowthBlocked: usesSpriteAddresses(bytes),
      status: needsConversion ? 'simplified' : alreadyTraditional ? 'traditional' : 'no-simplified-text',
      runtimeLanguage: rom.info.assetBase === MY_LAB_ASSET_BASE ? labLanguageStatus(rom) : 'not-included',
    };
  } catch (e) {
    return { supported: false, needsConversion: false, alreadyTraditional: false, status: 'unsupported', reason: e.message };
  }
}

/** Chinese strings of the main table as { id, text } (other codes shown as <code>). */
function strings(input, { variant } = {}) {
  const rom = loadRom(input instanceof Uint8Array ? input : new Uint8Array(input));
  const cs = charset(), conv = variant ? makeConverter(variantOf(variant), [], cs) : null;
  const render = (view) => view.map((c) => c >= PUA_BASE ? '<' + (c - PUA_BASE) + '>' : String.fromCodePoint(c)).join('');
  return rom.tables[rom.info.zhTable].strings.map((s, i) => {
    const end = s.indexOf(0) < 0 ? s.length : s.indexOf(0), codes = s.slice(0, end);
    const row = { id: i + 1, text: render(viewChars(cs, codes)) };
    if (conv) row.converted = render(conv.convertCodes(i + 1, codes).flatMap((t) => t.target !== null ? [t.target] : viewChars(cs, [t.code])));
    return row;
  });
}

root.ParaLabZh = {
  inspect, patch, verify, strings, romTraditionalGlyph,
  VARIANTS: Object.keys(VARIANTS), FONTS: Object.keys(FONTS),
  convertText: (text, variant) => makeConverter(variantOf(variant), [], charset()).convertText(text),
  ZhError,
  _internal: { charset, loadRom, loadMyLabBoot, FontSprite, encodeRle, encodeLz4, lz4DecodeBlock, rleDecode, tableParse, tableSerialize, arcParse, arcBuild, packParse, packBuild, glyphPack, latinPack, fontOf, variantOf, makeConverter, parseMapping },
};
if (typeof module !== 'undefined') module.exports = root.ParaLabZh;
})(typeof window !== 'undefined' ? window : globalThis);
