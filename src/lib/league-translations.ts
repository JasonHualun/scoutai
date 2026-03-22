const TEAM_MAP: Record<string, string> = {
  // 英超
  "Manchester United": "曼联",
  "Manchester City": "曼城",
  "Liverpool": "利物浦",
  "Chelsea": "切尔西",
  "Arsenal": "阿森纳",
  "Tottenham Hotspur": "热刺",
  "Tottenham": "热刺",
  "Newcastle United": "纽卡斯尔联",
  "Newcastle": "纽卡斯尔",
  "Aston Villa": "阿斯顿维拉",
  "West Ham United": "西汉姆联",
  "West Ham": "西汉姆",
  "Brighton & Hove Albion": "布莱顿",
  "Brighton": "布莱顿",
  "Fulham": "富勒姆",
  "Brentford": "布伦特福德",
  "Crystal Palace": "水晶宫",
  "Bournemouth": "伯恩茅斯",
  "Nottingham Forest": "诺丁汉森林",
  "Nottm Forest": "诺丁汉森林",
  "Everton": "埃弗顿",
  "Wolverhampton Wanderers": "狼队",
  "Wolverhampton": "狼队",
  "Wolves": "狼队",
  "Leicester City": "莱斯特城",
  "Leicester": "莱斯特城",
  "Leeds United": "利兹联",
  "Leeds": "利兹联",
  "Southampton": "南安普顿",
  "Burnley": "伯恩利",
  "Ipswich Town": "伊普斯维奇",
  "Sheffield United": "谢菲尔德联",
  "Luton Town": "卢顿",

  // 西甲
  "Real Madrid": "皇家马德里",
  "Barcelona": "巴塞罗那",
  "Atletico Madrid": "马德里竞技",
  "Atlético Madrid": "马德里竞技",
  "Sevilla": "塞维利亚",
  "Real Sociedad": "皇家社会",
  "Real Betis": "皇家贝蒂斯",
  "Villarreal": "比利亚雷亚尔",
  "Valencia": "瓦伦西亚",
  "Athletic Club": "毕尔巴鄂竞技",
  "Athletic Bilbao": "毕尔巴鄂竞技",
  "Celta Vigo": "塞尔塔",
  "Osasuna": "奥萨苏纳",
  "Getafe": "赫塔费",
  "Girona": "赫罗纳",
  "Las Palmas": "拉斯帕尔马斯",
  "Rayo Vallecano": "巴列卡诺",
  "Alaves": "阿拉维斯",
  "Alavés": "阿拉维斯",
  "Mallorca": "马洛卡",
  "Leganes": "莱加内斯",
  "Leganés": "莱加内斯",
  "Espanyol": "西班牙人",

  // 意甲
  "Juventus": "尤文图斯",
  "Inter": "国际米兰",
  "Inter Milan": "国际米兰",
  "AC Milan": "AC米兰",
  "Milan": "AC米兰",
  "Napoli": "那不勒斯",
  "Roma": "罗马",
  "AS Roma": "罗马",
  "Lazio": "拉齐奥",
  "Atalanta": "亚特兰大",
  "Fiorentina": "佛罗伦萨",
  "Torino": "都灵",
  "Udinese": "乌迪内斯",
  "Bologna": "博洛尼亚",
  "Genoa": "热那亚",
  "Monza": "蒙扎",
  "Hellas Verona": "维罗纳",
  "Lecce": "莱切",
  "Cagliari": "卡利亚里",
  "Empoli": "恩波利",
  "Como": "科莫",
  "Parma": "帕尔马",
  "Venezia": "威尼斯",

  // 德甲
  "Bayern Munich": "拜仁慕尼黑",
  "Borussia Dortmund": "多特蒙德",
  "RB Leipzig": "莱比锡红牛",
  "Bayer Leverkusen": "勒沃库森",
  "Union Berlin": "柏林联合",
  "Eintracht Frankfurt": "法兰克福",
  "Wolfsburg": "沃尔夫斯堡",
  "Borussia Monchengladbach": "门兴格拉德巴赫",
  "Borussia Mönchengladbach": "门兴格拉德巴赫",
  "Freiburg": "弗莱堡",
  "SC Freiburg": "弗莱堡",
  "Hoffenheim": "霍芬海姆",
  "TSG Hoffenheim": "霍芬海姆",
  "Werder Bremen": "不来梅",
  "Augsburg": "奥格斯堡",
  "FC Augsburg": "奥格斯堡",
  "Stuttgart": "斯图加特",
  "VfB Stuttgart": "斯图加特",
  "Mainz": "美因茨",
  "Mainz 05": "美因茨",
  "Heidenheim": "海登海姆",
  "FC Heidenheim": "海登海姆",
  "Holstein Kiel": "基尔",
  "St. Pauli": "圣保利",
  "FC St. Pauli": "圣保利",

  // 法甲
  "Paris Saint-Germain": "巴黎圣日耳曼",
  "Paris Saint Germain": "巴黎圣日耳曼",
  "PSG": "巴黎圣日耳曼",
  "Marseille": "马赛",
  "Olympique de Marseille": "马赛",
  "Lyon": "里昂",
  "Olympique Lyonnais": "里昂",
  "Monaco": "摩纳哥",
  "AS Monaco": "摩纳哥",
  "Lille": "里尔",
  "LOSC Lille": "里尔",
  "Rennes": "雷恩",
  "Stade Rennais": "雷恩",
  "Nice": "尼斯",
  "OGC Nice": "尼斯",
  "Lens": "朗斯",
  "RC Lens": "朗斯",
  "Strasbourg": "斯特拉斯堡",
  "Brest": "布雷斯特",
  "Nantes": "南特",
  "Toulouse": "图卢兹",
  "Reims": "兰斯",
  "Le Havre": "勒阿弗尔",
  "Montpellier": "蒙彼利埃",
  "Saint-Etienne": "圣埃蒂安",

  // 欧冠常见球队
  "Real Madrid CF": "皇家马德里",
  "FC Barcelona": "巴塞罗那",
  "Manchester City FC": "曼城",
  "Liverpool FC": "利物浦",
  "Chelsea FC": "切尔西",
  "Arsenal FC": "阿森纳",
  "Bayern München": "拜仁慕尼黑",
  "FC Bayern München": "拜仁慕尼黑",
  "Borussia Dortmund": "多特蒙德",
  "RB Leipzig": "莱比锡红牛",
  "Atletico de Madrid": "马德里竞技",
  "Juventus FC": "尤文图斯",
  "FC Internazionale": "国际米兰",
  "FC Porto": "波尔图",
  "Porto": "波尔图",
  "Benfica": "本菲卡",
  "SL Benfica": "本菲卡",
  "Celtic": "凯尔特人",
  "Ajax": "阿贾克斯",
  "AFC Ajax": "阿贾克斯",
  "PSV Eindhoven": "埃因霍温",
  "PSV": "埃因霍温",
  "Feyenoord": "费耶诺德",
  "Sporting CP": "体育里斯本",
  "Sporting Lisbon": "体育里斯本",
  "Club Brugge": "布鲁日",
  "Galatasaray": "加拉塔萨雷",
  "Fenerbahce": "费内巴切",
  "Fenerbahçe": "费内巴切",
  "Shakhtar Donetsk": "顿涅茨克矿工",
  "Dinamo Zagreb": "萨格勒布迪纳摩",
  "Red Bull Salzburg": "萨尔茨堡红牛",
  "Young Boys": "伯尔尼少年",
  "Slavia Prague": "布拉格斯拉维亚",
  "Viktoria Plzen": "比尔森胜利",
  "Plzen": "比尔森胜利",
  "Sturm Graz": "格拉茨风暴",
  "Aston Villa FC": "阿斯顿维拉",
  "Girona FC": "赫罗纳",
};

export function translateTeam(name: string): string {
  if (!name) return name;
  return TEAM_MAP[name] ?? name;
}

const LEAGUE_MAP: Record<string, string> = {
  // 五大联赛
  "Premier League": "英超",
  "La Liga": "西甲",
  "Serie A": "意甲",
  "Bundesliga": "德甲",
  "Ligue 1": "法甲",

  // 欧洲杯赛
  "UEFA Champions League": "欧冠",
  "UEFA Europa League": "欧联杯",
  "UEFA Europa Conference League": "欧协联",
  "UEFA Super Cup": "欧洲超级杯",
  "UEFA Nations League": "欧国联",

  // 英格兰
  "Championship": "英冠",
  "League One": "英乙",
  "League Two": "英丙",
  "FA Cup": "足总杯",
  "EFL Cup": "联赛杯",
  "Community Shield": "社区盾杯",
  "Premier League 2": "英超预备队联赛",

  // 西班牙
  "Copa del Rey": "国王杯",
  "Supercopa de España": "西超杯",

  // 意大利
  "Coppa Italia": "意大利杯",
  "Supercoppa Italiana": "意超杯",
  "Serie B": "意乙",

  // 德国
  "DFB Pokal": "德国杯",
  "DFL-Supercup": "德超杯",
  "2. Bundesliga": "德乙",

  // 法国
  "Coupe de France": "法国杯",
  "Trophée des Champions": "法超杯",
  "Ligue 2": "法乙",

  // 国际赛事
  "World Cup": "世界杯",
  "World Cup - Qualification": "世界杯预选赛",
  "World Cup - Qualification - Asia": "世界杯预选赛 亚洲区",
  "World Cup - Qualification - Europe": "世界杯预选赛 欧洲区",
  "World Cup - Qualification - South America": "世界杯预选赛 南美区",
  "European Championship": "欧洲杯",
  "European Championship - Qualification": "欧洲杯预选赛",
  "Asian Cup": "亚洲杯",
  "African Cup of Nations": "非洲杯",
  "Copa America": "美洲杯",
  "CONMEBOL Libertadores": "南美解放者杯",
  "CONMEBOL Sudamericana": "南美俱乐部杯",
  "FIFA Club World Cup": "世俱杯",

  // 其他联赛
  "Eredivisie": "荷甲",
  "Primeira Liga": "葡超",
  "Belgian Pro League": "比甲",
  "Scottish Premiership": "苏超",
  "Major League Soccer": "美职联",
  "Chinese Super League": "中超",
  "J1 League": "日职联",
  "J-League": "日职联",
  "K League 1": "韩K联",
  "Saudi Professional League": "沙特联",
  "Turkish Süper Ligi": "土超",
  "Süper Lig": "土超",
  "Russian Premier League": "俄超",
  "Pro League": "比甲",
  "Australian A-League": "澳超",
  "AFC Champions League": "亚冠",
  "AFC Champions League Elite": "亚冠精英",
  "CAF Champions League": "非冠",
};

const ROUND_MAP: Record<string, string> = {
  "Regular Season": "常规赛",
  "Playoffs": "季后赛",
  "Play-offs": "季后赛",
  "Qualification": "资格赛",
  "Qualifying": "资格赛",
  "Group Stage": "小组赛",
  "Groups": "小组赛",
  "Round of 16": "十六强",
  "Round of 32": "三十二强",
  "Quarter-finals": "四分之一决赛",
  "Semi-finals": "半决赛",
  "Final": "决赛",
  "3rd Place Final": "季军赛",
  "1st Round": "第一轮",
  "2nd Round": "第二轮",
  "3rd Round": "第三轮",
  "4th Round": "第四轮",
  "5th Round": "第五轮",
  "Matchday": "第",
};

/**
 * 将 "Premier League · Regular Season - 31" 格式的字符串翻译成中文
 */
export function translateLeague(raw: string): string {
  if (!raw) return raw;

  // 按 · 分割联赛名与轮次
  const dotIdx = raw.indexOf("·");
  const leagueEn = dotIdx >= 0 ? raw.slice(0, dotIdx).trim() : raw.trim();
  const roundEn  = dotIdx >= 0 ? raw.slice(dotIdx + 1).trim() : "";

  // 翻译联赛名
  const leagueCn = LEAGUE_MAP[leagueEn] ?? leagueEn;

  // 翻译轮次
  let roundCn = roundEn;
  if (roundEn) {
    // "Matchday 31" → "第31轮"
    const matchdayMatch = roundEn.match(/^Matchday\s+(\d+)$/i);
    if (matchdayMatch) {
      roundCn = `第${matchdayMatch[1]}轮`;
    } else {
      // "Regular Season - 31" → "常规赛 - 31"
      for (const [en, cn] of Object.entries(ROUND_MAP)) {
        if (roundEn.startsWith(en)) {
          roundCn = roundEn.replace(en, cn);
          break;
        }
      }
    }
  }

  return roundCn ? `${leagueCn} · ${roundCn}` : leagueCn;
}
