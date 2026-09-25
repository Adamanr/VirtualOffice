/**
 * Speech-bubble lines for prop outcomes. The server picks the outcome and a
 * `variant` number, so every client shows the very same line.
 */
const LINES: Record<string, string[]> = {
  'coffee_machine:perfect': ['Идеальный эспрессо. Я вижу смысл жизни ☕', 'Кофе как в Италии. Ну, почти.', 'Вот теперь можно и TPS-отчёт'],
  'coffee_machine:no_beans': ['Зёрна кончились. Ещё вчера.', 'В поддоне только надежда…', 'Кто допил последний и не насыпал?!'],
  'coffee_machine:scald': ['АЙ! Горячо!', 'Классика: ошпарился о кофемашину', 'Ой-ой-ой, пальцы!'],
  'coffee_machine:boiling': ['Чистый кипяток. Бюджетный дзен.', 'Кофе без кофе. Зато горячо.'],
  'water_cooler:gossip': [
    'Слышали? Опять «тимбилдинг» в зале 🤫',
    'Кто-то снова съел йогурт с именем на крышке',
    'HR рассылает опрос про «счастье». Опять.',
    'Говорят, в холодильнике обед Дуайта с 2005-го',
    'Принтер на третьем этаже… стоп, у нас нет третьего',
    'А вы знали, что у нас есть бухгалтерия?',
  ],
  'microwave:popcorn': ['ПОПКОРН-ВЗРЫВ! 🍿', 'Кажется, я передержал попкорн'],
  'microwave:fish': ['Рыбка! 🐟 (кухня эвакуируется)', 'Кто-то скажет, что пахнет. Я скажу — омега-3.'],
  'microwave:forever': ['Ещё 30 секунд… и ещё 30…', 'Внутри всё ещё лёд. Как это возможно?'],
  'microwave:soup': ['Суп испарился. Тарелка горячая, супа нет.', 'Суп ушёл в астрал 🍜'],
  'fridge:dwight_lunch': ['«НЕ ТРОГАТЬ. — Д.» Не трогаю.', 'Обед Дуайта. С запиской и печатью.'],
  'fridge:yogurt': ['Безымянный йогурт — значит, общий!', 'Йогурт без подписи. Рискну.'],
  'fridge:mold': ['Там… что-то живёт. Закрываю тихо.', 'Плесень с характером. Я её не видел.'],
  'fridge:cake': ['Торт «на ДР». ДР был в марте 🎂', 'Кусочек торта ничей. Уже мой.'],
  'copier:ok': ['Печать пошла. Магия!', 'Квартальный отчёт, 12 копий'],
  'copier:twss': ['THAT’S WHAT SHE SAID ×47', 'Ой, это не тот файл…'],
  'copier:jam': ['Замятие. Опять. 😤', 'Бумага сложилась в оригами «боль»'],
  'copier:avalanche': ['ЛАВИНА БУМАГИ!', 'Кажется, я нажал «печать» 500 раз'],
  'vending_machine:drop': ['Добыча! 🥤', 'Автомат сегодня добрый', 'Это лучшее, что со мной случилось за день'],
  'vending_machine:jam': ['Застряло!!! Оно висит!', 'Нет-нет-нет, только не это'],
  'vending_machine:poke': ['Ну давай же… падай…', 'Тук-тук. Есть кто?'],
  'vending_machine:unjam': ['Пинок решает всё 🦵', 'Спасибо, я заберу. Нет, это теперь моё.'],
  'vending_machine:kick': ['Автомат не впечатлён', 'Ай, нога!'],
  'toss:bin': ['Свиш! 🏀', 'Даже не смотрел', 'Как Коби, только в офисе'],
  'toss:three': ['ТРЁХОЧКОВЫЙ!!! 🏆', 'С центра поля, детка!'],
  'toss:bonk': ['Бонк! 😵', 'Эй! Кто бросил?!', 'Ай! Это была моя голова'],
  'drill:pull': ['ПОЖАР! Все на выход! 🔥', 'Это учения! Наверное…', 'Спокойно! Без паники! ПАНИКА!'],
  'jello:in': ['Твой степлер теперь в желе 😈', 'Опять желе? Классика.'],
  'jello:out': ['Спасаю степлер из желе…', 'Шлёп! Степлер свободен'],
}

export function line(key: string, variant = Math.floor(Math.random() * 1000)): string | null {
  const list = LINES[key]
  return list?.length ? list[variant % list.length]! : null
}

export const hasLine = (key: string) => key in LINES

/** Funny vending items and the color of their wrapper. */
export const VENDING_ITEMS: [string, string][] = [
  ['чипсы «Scranton Heat»', '#e5484d'],
  ['газировку без пузырьков', '#4f8cff'],
  ['батончик «Шрут»', '#8a5a2b'],
  ['жвачку со вкусом бумаги', '#f5f0e6'],
  ['энергетик «TPS Report»', '#30a46c'],
  ['воду за цену эспрессо', '#9fd2ff'],
  ['просроченный йогурт', '#f8bbd0'],
  ['мармеладки с ресепшена', '#f5a524'],
]

export function pickVendingItem() {
  return VENDING_ITEMS[Math.floor(Math.random() * VENDING_ITEMS.length)]![0]
}

export function vendingColor(item: string | null | undefined) {
  return VENDING_ITEMS.find(([name]) => name === item)?.[1] ?? '#e5484d'
}
