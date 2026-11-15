// Semantic categories for Valio's numeric category codes (the product file
// has codes only, no names). Each product gets a tag from the first keyword
// group its English or Finnish name matches; each numeric category then takes
// the majority tag of its products (`deriveCategories`). Pure, no I/O.
//
// Codes use the policy taxonomy (dairy.milk, dry.pasta, beverages.coffee…) so
// signed rules like `category.allow: [dairy.milk, …]` keep meaning what they
// say; categories no keyword group wins become `other.<slug>`.

export type CategoryTag = string;

/** First match wins: specific phrases ("ice cream", "cream cheese", "buttermilk") come before the generic word. */
export const CATEGORY_KEYWORDS: [CategoryTag, RegExp][] = [
  // Non-food that food words would otherwise catch ("wine glass", "bread tin", "105x95x60mm cake box").
  ['nonfood.tableware', /\bglass(es)?\b(?! noodles)|tumbler|\bmugs?\b|\bjugs?\b|\bbowls?\b|kulho|\btongs?\b|\bladle|\btins?\b|\bvuoka|\bpelti|\bbuckets?\b|ämpäri|thermometer|lämpömittari|\bscoop\b|\bslicer|\bspreader|\bsharpener|\bgn\b|\bchafer|\bdispenser|\btray\b|\bcutlery|\bknife|\bspoons?\b|\bforks?\b|\b\d+\s*[x×]\s*\d+\s*[x×]\s*\d+\s*(mm|cm)?\b/],
  ['dairy.desserts', /\bice[- ]?cream\b|jäätelö|\bpuddings?\b|vanukas|vanilla sauce|vaniljakastike|\bsorbet/],
  ['beverages.coffee', /caff[eè] latte|\blatte\b|cappuccino|macchiato|ice[d]? coffee|\bcocoa (drink|powder)|kaakaojuoma/],
  ['dry.baking', /condensed|kondensoi|tiivistetty maito/],
  ['pantry.sauces', /vinegar|\betikka|balsam|\baceto\b|\bmirin|\bbouillon|\bfond\b|\bliemi|\bbroth|fish sauce|kalakastike/],
  ['pantry.spreads', /peanut butter|nut butter|pähkinävoi|hazelnut spread|nutella|\bchocolate spread/],
  ['plant.drinks', /\b(oat|soy|soya|almond|rice|pea|coconut|cashew) ?(drink|beverage|milk)|kaurajuoma|soijajuoma|mantelijuoma|riisijuoma|kookosmaito|oddlygood (barista|drink)/],
  ['plant.alternatives', /oatly|plant[- ]based|\bvegan\b|vegaani|kasvipohjai|\bimat\b|alpro|oddlygood|violife|flora professional|\bmifu|\btofu|quorn|oumph|härkis|\bsoijavalmiste|kauravalmiste|soya product|\bseitan|\btempeh|veggie|\bnyhtökaura/],
  ['pantry.oils', /margarine|margariini|vegetable fat|kasvirasva|\bshortening|\bfrying fat|\bpaistorasva/],
  ['dairy.cheese', /cream cheese|tuorejuusto|cottage cheese|raejuusto|\bcheeses?\b|juusto|mozzarella|parmesan|parmigiano|grana padano|cheddar|\bedam|emmental|\bfeta\b|halloumi|gouda|\bbrie\b|camembert|oltermanni|mascarpone|ricotta|pecorino|gorgonzola/],
  ['dairy.yoghurt', /yogh?urt|jogurtti|\bquark|rahka|\bviili|\bskyr\b|\bkefir|fermented milk|\bgurt\b/],
  ['dairy.milk', /buttermilk|\bpiimä|\bmilk( drink| powder)?\b(?! chocolate)|\bmaito(juoma)?\b|kevytmaito|rasvaton maito|täysmaito|maitojuoma|ykkösmaito|\bkulutusmaito/],
  ['dairy.cream', /sour cream|smetana|cr[eè]me fra[iî]che|ranskankerma|kermaviili|\bcream\b(?! (cheese|of|soup|liqueur|powder))|\bkerma\b|kuohukerma|ruokakerma|vispikerma|vispautuva|\bkermaa?\b/],
  ['dairy.butter', /\bbutter\b(?! (chicken|beans?|cookies?|biscuits?|croissants?|scotch|cake|spreader))|\bvoi\b|\bvoita\b|voisula|\bghee\b|levite|\boivariini|\bspreadable/],
  ['eggs', /\beggs?\b|kananmun|\bmunat?\b|\bmunamassa|\begg (white|yolk)/],
  ['bakery.pastries', /croissant|pastr(y|ies)|\bpulla|\bbuns?\b|munkki|donut|doughnut|\bdanish|wienerleipä|muffin|\bcakes?\b|kakku|\bpies?\b|piirakka|\btart|leivos|brownie|cinnamon roll|korvapuusti|\bwaffle|vohveli|\bpancake|pannukak|\bcrepes?\b|\bcookies?\b|\bbiscuits?\b|\bkeksi|\bcrackers?\b|\brusk/],
  ['bakery.bread', /\bbread\b|leipä|leivät|\bruis|baguette|patonki|\btoast|sämpylä|bread rolls?|\btortilla|\bpita\b|\bbagel|ciabatta|focaccia|näkkileipä|crispbread|rieska|\blimppu|\bpanini|sandwich/],
  ['dry.flour', /\bflour\b|\bjauho(t)?\b|vehnäjauho|ruisjauho|kaurajauho|\bsemolina|mannasuurimo|breadcrumbs|korppujauho|\bpanko/],
  ['dry.pasta', /\bpasta\b|spag(h)?etti|macaroni|makaroni|\bpenne\b|fusilli|lasagne|\bnoodles?|nuudeli|tagliatelle|fettuccine|farfalle|rigatoni|tortellini|ravioli|\bgnocchi|linguine|conchiglie|\budon/],
  ['dry.rice', /\brice\b|\briisi|basmati|risotto|\bbulgur|\bquinoa|couscous|kuskus/],
  ['dry.cereals', /oat ?flakes|kaurahiutale|hiutale|\bflakes\b|\bmuesli|\bmüesli|\bmysli|\bcereals?\b|\bporridge|\bpuuro|granola|\boats\b|\bkaura\b|\bpops\b/],
  ['beverages.soft', /alcohol[- ]?free|non[- ]alcoholic|alkoholiton|\b0[.,]0 ?%|\b0 ?% alc/],
  ['beverages.alcohol', /\bbeers?\b|\bolut|\bwines?\b|\bviini|\bcider|siideri|lonkero|long drink|vodka|\bgin\b|whisk(e)?y|liqueur|likööri|\brum\b|cognac|kuohuviini|\balcohol/],
  ['beverages.coffee', /coffee|\bkahvi|espresso|\btea\b|\btee\b|teepuss|\bcocoa\b|\bkaakao/],
  ['beverages.juice', /\bjuices?\b|\bmehu|\bnectar|smoothie|täysmehu/],
  ['beverages.soft', /soft drink|lemonade|limonadi|\bcola\b|\bwater\b|\bvesi\b|kivennäisvesi|energy ?drink|energiajuoma|\bsoda\b|virvoitusjuoma|\bkombucha|\btonic\b|ginger beer|\bvichy\b/],
  ['fish', /\bfish|\bkala(?!mata)|salmon|\blohi|herring|silakka|\bsilli|\btuna\b|tonnikala|\bcod\b|turska|shrimps?|katkarap|prawns?|\btrout|taimen|kirjolohi|\bpike\b|hauki|\bperch|ahven|whitefish|\bsiika|mackerel|makrilli|seafood|äyriäi|mussels?|simpuk|\bcrab|\brapu|crayfish|burbot|pikeperch|\bkuha\b|vendace|muikku|\bsurimi|anchov|sardin|squid|kalmari|octopus|pollock|seiti|\bhake\b|saithe|flounder|\broe\b|\bmäti|caviar|\bclams?\b|cockles|\boysters?\b/],
  ['ready.meals', /ready meal|valmisruoka|\bpizza|\blasagna|casserole|\bsoups?\b|\bkeitto|\bburgers?\b|hampurilai|\bwraps?\b|\bpatty|patties|pihvi|\bnuggets?|\bfalafel|\bschnitzel|\bmeal\b|\bateria|\bgratin|gratiini|\bspring rolls?|kevätkääry|\bsushi|\bgoulash|\bstew\b|\bbaby ?food|\bpiltti|\btimbale/],
  ['meat', /\bbeef|\bnauta|\bpork|porsas|\bsika|chicken|\bkana\b|broiler|turkey|kalkkuna|\blamb\b|lammas|\bham\b|kinkku|sausage|makkara|nakki|\bmeat|\bliha|bacon|pekoni|minced|jauheliha|meatballs?|lihapull|salami|kebab|reindeer|\bporo|\bveal|\bvasikka|\bduck|\bankka|frankfurter|chorizo|pepperoni|prosciutto|leikkele|bresaola|\bpat[eé]\b|liver|maksa|\bquail|\boxtail|entrecote|\bsirloin|tenderloin|\bloin\b|\bbrisket|\bribs?\b|\baspic/],
  ['pantry.sauces', /\bsauces?\b|kastike|ketchup|mustard|sinappi|mayonnaise|majoneesi|dressing|\bsalsa\b|\bpesto|\bdips?\b|remoulade|\bglaze/],
  ['pantry.oils', /\boils?\b|öljy|\bformspray/],
  ['snacks.sweets', /chocolate|suklaa|\bcandy|karkki|makeinen|makeiset|liquorice|licorice|lakritsi|salmiakki|\bchips\b|sipsi|\bcrisps\b|\bnuts?\b|nutmix|pähkinä|peanuts?|hazelnuts?|almonds?|cashew|\bsnacks?\b|popcorn|\bgum\b|purukumi|xylitol|pastilli|\bmints?\b|marshmallow|\bwafer|lollipop|\btoffee|jellies|\bbars?\b|patukka|\bpraline/],
  ['pantry.jams', /\bjams?\b|\bhillo|marmalade|marmeladi|lemon curd|\bfruit filling|\bpur[eé]e\b/],
  ['dry.baking', /\bsugar\b(?! snap)|\bsokeri|\byeast\b|\bhiiva|baking powder|leivinjauhe|\bgelatin|liivate|\bstarch|tärkkelys|\bsyrup|siirappi|\bhoney\b|\bhunaja|sweetener|makeutusaine|\bdecoration|koriste|\bsprinkles/],
  ['pantry.spices', /\bspices?\b|mauste|pippuri|black pepper|lemon pepper|lime pepper|\bsalt\b|\bsuola|curry|cinnamon|kaneli|oregano|paprika powder|\bseasoning|\brub\b|\bthyme|timjami|rosemary|rosmariini|nutmeg|muskotti|cardamom|kardemumma|\bvanilla\b|vanilja|\bpaste\b|\btahini/],
  ['produce.vegetables', /potato|\bperuna|tomato|tomaatti|tomberry|cucumber|\bkurkku|\bonions?\b|sipuli|shal+ots?|carrot|porkkana|cabbage|\bkaali|sauerkraut|lettuce|salaatti|\bpeppers?\b|paprika|mushroom|\bsieni|herkkusieni|chanterel|kantarelli|porcini|\bchamp\b|broccoli|parsakaali|cauliflower|kukkakaali|beetroot|punajuuri|zucchini|courgette|kesäkurpitsa|pumpkin|kurpitsa|garlic|valkosipuli|\bleek|purjo|spinach|pinaatti|\bpeas?\b|\bherne|\bbeans?\b|\bpapu|pavut|chickpea|lentil|linssi|\bcorn\b|maissi|celery|selleri|parsnip|palsternakka|\bbasil|\bdill\b|\btilli|persilja|parsley|vegetables?|vihannes|kasvis|juures|\bradish|retiisi|\bkale\b|lehtikaali|asparagus|\bparsa\b|eggplant|aubergine|munakoiso|\bginger|inkivääri|\bchil(l)?i|turnip|nauris|lanttu|\bswede|sprouts|\bidut|\bitu\b|mangold|\bfennel|fenkoli|artichoke|\bherbs?\b|\byrtti|\bsalads?\b|rucola|rocket|arugula|\bchives|ruohosipuli|\bcress|\bshoots?\b|\bolives?\b|oliivi|\bfries\b|ranskalai|\brosti\b|\bcactus|\bbay leaf/],
  ['produce.fruit', /\bapples?\b|\bomena|banana|banaani|\boranges?\b|appelsiini|\bpears?\b|päärynä|\bgrapes?\b|viinirypäle|\blemons?\b|sitruuna|\blimes?\b|\bmango|pineapple|ananas|melon|meloni|\bkiwi|\bplums?\b|\bluumu|\bprunes?\b|raisins?|rusina|\bpeach|persikka|nectarine|nektariini|\bberr(y|ies)|\bmarja|strawberr|mansikka|blueberr|bilberr|mustikka|lingonberr|puolukka|raspberr|vadelma|cloudberr|\blakka|currants?|herukka|cherr(y|ies)|kirsikka|avocado|avokado|pomegranate|granaattiomena|\bfigs?\b|\bdates\b|taateli|clementine|klementiini|mandarin|grapefruit|\bfruits?\b|hedelmä|apricot|aprikoosi|rhubarb|raparperi|papaya|jackfruit|cherimoya|passion ?fruit|\blychee/],
  ['nonfood.cleaning', /detergent|\bpesuaine|pesuneste|\bpesu|clean(er|ing)|puhdistus|puhdist|\bsoaps?\b|saippua|dishwash|astianpesu|disinfect|desinf|\brinse|huuhtelu|\bsuma\b|\bbac\b|degreaser|\bwax\b|\bvaha|sanitiz|\bbleach|valkaisu|laundry|pyykki|descal|kalkinpois|\bshampoo|toothpaste|hammastahna|hand ?wash|\bcloths?\b|\bliina\b|sponge|sieni(?=\s*(pyyhe|liina))|\bmop\b|\bbrush/],
  ['nonfood.disposables', /napkin|lautasliina|\bcups?\b|\bmuki|\bplates?\b|lautanen|\bgloves?\b|käsine|\bfoil\b|folio|\bbags?\b|\bpussi|\bstraws?\b|\bpilli|container|\brasia|\blids?\b|\bkansi|\bkannet|\bpaper\b|paperi|towel|pyyhe|tissue|hankie|nenäliina|\bfilm\b|kelmu|\bboxe?s?\b|\balusta|\bcandles?\b|kynttilä|\bpicks?\b|\bskewers?|\btablecloth|pöytäliina|tablecover|tableskirt|\bcoasters?|\bwipes?\b|\bpyyh|\bsacks?\b|\bsäkki|\bbins?\b|\broll\b|\brulla|toilet|\bplaster|laastari|\bmarker|\bink\b|\btape\b|\bstaples|\bbattery|\bparisto|\bled\b|\bfuse\b/],
];

const STOP = new Set(['valio', 'with', 'from', 'and', 'the', 'for', 'pcs', 'kg', 'g', 'l', 'ml', 'cl', 'dl', 'ltr', 'free', 'pack', 'x', 'organic', 'luomu']);

/** The keyword-group tag of one product name (English and Finnish joined), or null. */
export const tagOf = (text: string): CategoryTag | null => {
  const t = text.toLowerCase();
  for (const [tag, re] of CATEGORY_KEYWORDS) if (re.test(t)) return tag;
  return null;
};


export type CategoryInfo = { id: string; code: string; products: number; tagged: number; share: number; label: string };

/** Most frequent meaningful English word in a set of names → slug for an unrecognised category. */
const slugFor = (names: string[], id: string) => {
  const counts = new Map<string, number>();
  for (const n of names) {
    const seen = new Set<string>();
    for (const w of n.toLowerCase().replace(/[^a-zäöå]+/g, ' ').split(' ')) {
      if (w.length < 4 || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best && best[1] >= Math.max(2, names.length * 0.2) ? best[0].normalize('NFD').replace(/[^a-z]/g, '') : `c${id}`;
};

/**
 * Majority vote per numeric category. `items` = (numeric category, English
 * name, Finnish name). A category needs a tag on ≥ 25 % of its products (and
 * the tag ahead of every other tag) to take it; else `other.<slug>`.
 * Returns category → info, and the per-item tags (same order as `items`).
 */
export const deriveCategories = (items: { categoryId: string; en: string; fi: string }[]) => {
  const tags = items.map((i) => tagOf(`${i.en} | ${i.fi}`));
  const byCat = new Map<string, { tags: Map<string, number>; names: string[]; n: number; tagged: number }>();
  items.forEach((it, i) => {
    let c = byCat.get(it.categoryId);
    if (!c) byCat.set(it.categoryId, (c = { tags: new Map(), names: [], n: 0, tagged: 0 }));
    c.n++;
    c.names.push(it.en || it.fi);
    const tag = tags[i];
    if (tag) {
      c.tagged++;
      c.tags.set(tag, (c.tags.get(tag) ?? 0) + 1);
    }
  });
  const categories = new Map<string, CategoryInfo>();
  for (const [id, c] of byCat) {
    const [top] = [...c.tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const share = top ? top[1] / c.n : 0;
    const code = top && share >= 0.25 ? top[0] : `other.${slugFor(c.names, id)}`;
    categories.set(id, { id, code, products: c.n, tagged: c.tagged, share: Math.round(share * 100) / 100, label: code });
  }
  return { categories, tags };
};

const SPREAD_NOT_BUTTER = /margarin|vegetable (fat )?spread|kasvirasvalevite|vegetable fat/i;

/**
 * The product's semantic category: its numeric category's code, except that
 * margarines / vegetable-fat spreads filed with butter leave dairy.butter for
 * pantry.oils (so "dairy" keeps meaning dairy). The other direction is NOT
 * overridden: "cheese cake", "ham-cheese sandwich", "cream sauce" are not
 * dairy products, so a dairy word in a non-dairy category's product doesn't move it.
 */
export const productCategory = (categoryCode: string, ownTag: CategoryTag | null, name = '') =>
  categoryCode.startsWith('dairy.') && ownTag === 'pantry.oils' && SPREAD_NOT_BUTTER.test(name) ? 'pantry.oils' : categoryCode;
