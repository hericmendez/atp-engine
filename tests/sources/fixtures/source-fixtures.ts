export const WIKIPEDIA_SEARCH_RESPONSE = {
  query: {
    search: [
      {
        pageid: 12345,
        title: 'Resident Evil 4',
        snippet: '<span class="searchmatch">Resident Evil 4</span> is a survival horror game...',
        wordcount: 5000,
      },
      {
        pageid: 12346,
        title: 'Resident Evil 4 (2020 video game)',
        snippet: 'Resident Evil 4 is a survival horror game developed by Capcom...',
        wordcount: 4500,
      },
    ],
    searchinfo: { totalhits: 2 },
  },
};

export const WIKIPEDIA_PAGE_RESPONSE = {
  parse: {
    pageid: 12345,
    title: 'Resident Evil 4',
    wikitext: {
      '*':
        '{{Infobox video game\n' +
        '| title = Resident Evil 4\n' +
        '| developer = Capcom Production Studio 4\n' +
        '| publisher = Capcom\n' +
        '| platform = PlayStation 2, Windows, Wii, Xbox 360, PlayStation 3, PlayStation 4, Xbox One, Nintendo Switch, iOS, Android\n' +
        '| genre = Survival horror, third-person shooter\n' +
        '| release date = October 25, 2005\n' +
        '| description = A survival horror game\n' +
        '}}\n\n' +
        'Resident Evil 4 is a survival horror game developed and published by Capcom.',
    },
    categories: [{ '*': 'Video games' }, { '*': 'Capcom games' }],
  },
};

export const WIKIPEDIA_NON_GAME_RESPONSE = {
  parse: {
    pageid: 99999,
    title: 'Resident Evil (film)',
    wikitext: {
      '*':
        '{{Infobox film\n' +
        '| title = Resident Evil\n' +
        '| director = Paul W.S. Anderson\n' +
        '| studio = Constantin Film\n' +
        '| released = March 15, 2002\n' +
        '}}\n\n' +
        'Resident Evil is a 2002 action horror film.',
    },
    categories: [{ '*': 'Films' }],
  },
};

export const STEAM_APP_LIST_RESPONSE = {
  applist: {
    apps: [
      { appid: 254700, name: 'Resident Evil 4' },
      { appid: 254710, name: 'Resident Evil 5' },
      { appid: 413150, name: 'Stardew Valley' },
    ],
  },
};

export const STEAM_APP_DETAILS_RESPONSE = {
  '254700': {
    success: true,
    data: {
      type: 'game',
      name: 'Resident Evil 4',
      developer: 'Capcom',
      publisher: 'Capcom',
      release_date: {
        coming_soon: false,
        date: 'Oct 25, 2005',
      },
      platforms: {
        windows: true,
        mac: false,
        linux: false,
      },
      categories: [{ id: 2, description: 'Single-player' }],
      genres: [
        { id: '1', description: 'Action' },
        { id: '4', description: 'Adventure' },
      ],
      short_description:
        'In Resident Evil 4, special agent Leon S. Kennedy is sent on a mission...',
      header_image: 'https://cdn.akamai.steamstatic.com/steam/apps/254700/header.jpg',
      capsule_image: 'https://cdn.akamai.steamstatic.com/steam/apps/254700/capsule_616x353.jpg',
      website: 'http://www.capcom.com/residentevil4/',
      recommendations: { total: 50000 },
    },
  },
};

export const STEAM_MULTI_PLATFORM_RESPONSE = {
  '413150': {
    success: true,
    data: {
      type: 'game',
      name: 'Stardew Valley',
      developer: 'ConcernedApe',
      publisher: 'ConcernedApe',
      release_date: {
        coming_soon: false,
        date: 'Feb 26, 2016',
      },
      platforms: {
        windows: true,
        mac: true,
        linux: true,
      },
      genres: [
        { id: '3', description: 'Indie' },
        { id: '2', description: 'RPG' },
      ],
      short_description: 'Stardew Valley is an open-ended country life RPG!',
      header_image: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/header.jpg',
    },
  },
};

// IGDB Fixtures

export const IGDB_OAUTH_TOKEN_RESPONSE = {
  access_token: 'test-access-token-igdb',
  expires_in: 5587808,
  token_type: 'bearer',
};

export const IGDB_SEARCH_RESPONSE = [
  {
    id: 1942,
    name: 'The Witcher 3: Wild Hunt',
    slug: 'the-witcher-3-wild-hunt',
    summary:
      'The Witcher 3: Wild Hunt is a 2015 action role-playing game developed and published by CD Projekt.',
    first_release_date: 1431993600,
    genres: [12, 31],
    platforms: [6, 48, 49, 130],
    involved_companies: [100],
    cover: {
      id: 'co1vkf',
      url: '/uploads/co1vkf.jpg',
      image_id: 'co1vkf',
    },
    screenshots: [{ id: 'sc1abc', url: '/uploads/sc1abc.jpg', image_id: 'sc1abc' }],
    themes: [1],
  },
  {
    id: 1020,
    name: 'Resident Evil 4',
    slug: 'resident-evil-4',
    summary: 'Resident Evil 4 is a 2005 survival horror game developed and published by Capcom.',
    first_release_date: 1130217600,
    genres: [5, 31],
    platforms: [6, 48],
    involved_companies: [101],
    cover: {
      id: 'co2def',
      url: '/uploads/co2def.jpg',
      image_id: 'co2def',
    },
    screenshots: [],
    themes: [1],
  },
];

export const IGDB_GAME_DETAIL_RESPONSE = [
  {
    id: 1942,
    name: 'The Witcher 3: Wild Hunt',
    slug: 'the-witcher-3-wild-hunt',
    summary:
      'The Witcher 3: Wild Hunt is a 2015 action role-playing game developed and published by CD Projekt.',
    first_release_date: 1431993600,
    genres: [12, 31],
    platforms: [6, 48, 49, 130],
    involved_companies: [100],
    cover: {
      id: 'co1vkf',
      url: '/uploads/co1vkf.jpg',
      image_id: 'co1vkf',
    },
    screenshots: [{ id: 'sc1abc', url: '/uploads/sc1abc.jpg', image_id: 'sc1abc' }],
    themes: [1],
  },
];

export const IGDB_COMPANIES_RESPONSE = [
  {
    id: 100,
    name: 'CD Projekt Red',
  },
];

export const IGDB_COMPANIES_MULTI_RESPONSE = [
  {
    id: 101,
    name: 'Capcom',
  },
];
