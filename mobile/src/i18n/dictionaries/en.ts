/**
 * English — the source of truth for the shape of every other locale.
 *
 * Adding a key here makes TypeScript demand a translation in `az`, `ru`
 * and `tr`. That is the whole enforcement mechanism, and it is enough:
 * a missing string cannot ship.
 *
 * These are the *interface* strings. Story text, illustrations and
 * narration are in the story's own language, which a parent chooses per
 * book and which has nothing to do with this file. A parent may read the
 * app in Azerbaijani and make a book in Russian.
 *
 * Deliberately separate from the website's dictionaries rather than
 * shared: the two surfaces have different screens and different wording,
 * and wiring a second package into Metro to share a hundred UI strings
 * would buy a build-system problem to solve a copy problem.
 */
export const en = {
  common: {
    appName: 'Nagilai',
    loading: 'Loading…',
    retry: 'Try again',
    back: 'Back',
    next: 'Next',
    cancel: 'Cancel',
    save: 'Save',
    remove: 'Remove',
    done: 'Done',
    close: 'Close',
    optional: 'Optional',
    offline: 'Offline',
    somethingWentWrong: 'Something went wrong. Please try again.',
    noConnection: 'We could not reach Nagilai. Check your connection.',
  },

  tabs: {
    library: 'Library',
    create: 'New story',
    children: 'Children',
    settings: 'Settings',
  },

  auth: {
    tagline: 'Your child. Their imagination. Their own story.',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    passwordHint: 'At least 10 characters.',
    signIn: 'Sign in',
    createAccount: 'Create account',
    switchToSignUp: 'No account yet? Create one',
    switchToSignIn: 'Already have an account? Sign in',
    confirmEmail: 'Almost there — confirm your email address to finish signing up.',
    signUpFailed: 'We could not create your account. Please check the details and try again.',
    signInFailed: 'That email and password did not match. Please try again.',
    continueWithApple: 'Continue with Apple',
    continueWithGoogle: 'Continue with Google',
    orUseEmail: 'or use your email',
    cancelled: 'Sign-in was cancelled.',
    providerFailed: 'That sign-in did not work. Please try another way.',
  },

  library: {
    opening: 'Opening your library',
    emptyTitle: 'Your library is waiting',
    emptyDescription: 'Make your first story and it will live here.',
    createFirst: 'Create a story',
    beingMade: 'Being made…',
    loadFailed: 'We could not load your library.',
    pagesCount: '{count} pages',
    savedOnDevice: 'You have {count} saved on this device.',
  },

  children: {
    title: 'Children',
    emptyTitle: 'No child profiles yet',
    emptyDescription: 'Add your first child and we will personalise every story around them.',
    add: 'Add a child',
    addAnother: 'Add another child',
    yearsOld: '{count} years old',
    loadFailed: 'We could not load your children.',
    privacyNote: 'These details are never public and are never used to train anything.',
  },

  childForm: {
    title: 'Add a child',
    name: 'Name',
    nameHint: 'This is the name used in the story.',
    nickname: 'Nickname',
    nicknameHint: 'Used instead of their name if you set one.',
    age: 'Age',
    ageHint: 'Shapes the vocabulary and the length.',
    gender: 'How should we refer to them?',
    genderHint: 'Used for pronouns in the story. Leave it blank and we will avoid them.',
    genderGirl: 'Girl',
    genderBoy: 'Boy',
    genderNeutral: 'Neither',
    genderUnset: 'Prefer not to say',
    language: 'Preferred story language',
    languageHint: 'The default for their books. You can change it for any one story.',
    interests: 'Interests',
    interestsHint: 'Separate with commas. Dinosaurs, football, the sea…',
    animals: 'Favourite animals',
    activities: 'Favourite activities',
    activitiesHint: 'Drawing, climbing, baking…',
    personality: 'Personality',
    personalityHint: 'Curious, gentle, stubborn, funny…',
    learning: 'Things they are learning',
    learningHint: 'Counting, sharing, the alphabet…',
    avatarColour: 'Profile colour',
    avatarColourHint: 'Just for their card in the app.',
    appearance: 'How they look',
    appearanceHint:
      'A short description helps the illustrations look like your child, page after page. No photograph needed.',
    appearancePlaceholder: 'Curly dark hair, brown eyes, always in a red jumper.',
    notes: 'Anything else we should know?',
    notesHint: 'Something to include, or something to avoid.',
    noPhotoTitle: 'No photograph needed',
    noPhotoBody:
      'Nagilai never asks for a picture of your child. The description above is what keeps the illustrations consistent.',
    save: 'Save profile',
    saveFailed: 'We could not save this profile.',
    tagLimit: 'We kept the first {count}.',
  },

  create: {
    gettingReady: 'Getting ready',
    stepWho: 'Who',
    stepWhat: 'What',
    stepTouches: 'Touches',
    whoTitle: 'Who is it for?',
    whatTitle: 'What kind of story?',
    touchesTitle: 'A few last touches',
    needsChildTitle: 'Add a child profile first',
    needsChildDescription: 'Every Nagilai story is built around a real child. It only takes a moment.',
    storyLanguage: 'Story language',
    storyLanguageHint: 'The whole book — text, narration and PDF — will be in this language.',
    storyType: 'Story type',
    somethingToLearn: 'Something to learn',
    noLesson: 'No particular lesson',
    illustrationStyle: 'Illustration style',
    noPictures: 'No pictures',
    length: 'Length',
    lengthShort: 'Short',
    lengthMedium: 'Medium',
    lengthLong: 'Long',
    pagesSuffix: '{count}p',
    instructions: 'Anything you would like to happen?',
    instructionsPlaceholder: '{child} travels to space and learns why planets orbit the sun.',
    starting: 'Starting…',
    createButton: 'Create the story · {cost}',
    creditsLeft: '{count} credits left',
    notEnoughCredits: 'This story needs {needed} credits and you have {have}.',
    costTitle: 'What this costs',
    costText: 'Story text',
    costPictures: 'Pictures ({count})',
    costTotal: 'Total',
    notEnoughHelp: 'A shorter story, or one without pictures, costs less.',
    withoutPictures: 'Make it without pictures ({count})',
    loadFailed: 'We could not load the story options.',
    startFailed: 'We could not start this story. Please try again.',
  },

  reader: {
    opening: 'Opening the book',
    makingTitle: 'Making your story',
    makingDefault: 'Getting ready',
    picturesPainted: '{ready} of {total} pictures painted',
    makingFootnote: 'This usually takes a minute or two. You can close the app — we will keep going.',
    makingFootnoteWithPush: 'You can close the app. We will tell you when it is ready.',
    failedTitle: 'We could not finish this story',
    failedBody: 'Nothing has been charged for the part that failed. You can try again.',
    backToLibrary: 'Back to library',
    openFailed: 'We could not open this story.',
    cover: 'Cover',
    theEnd: 'The End',
    pageOf: 'Page {page} of {total}',
    forChild: 'For {name}',
    forGrownUps: 'FOR GROWN-UPS',
    listen: 'Listen',
    preparingNarration: 'Preparing the narration…',
    narrateFailed: 'We could not start the narration.',
    play: 'Play',
    pause: 'Pause',
    startAgain: 'Start again',
    playbackSpeed: 'Playback speed',
    saveOffline: 'Save offline',
    savedOffline: 'Saved offline',
    savingPercent: 'Saving {percent}%',
    saveIncomplete: 'Saved, but {count} missing',
    saveIncompleteHint:
      'Some pictures could not be downloaded. Tap to finish saving next time you are online.',
    share: 'Share',
    shareFailed: 'We could not create a link.',
    removeDownload: 'Remove download',
  },

  settings: {
    signedInAs: 'Signed in as',
    credits: '{count} credits',
    language: 'App language',
    languageHint: 'Changes the buttons and labels, never the stories themselves.',
    booksOnDevice: 'Books on this device',
    booksEmpty: 'Save a book from its page to read it without a connection.',
    booksSummary: '{count} · {size}',
    bookCount: '{count} books',
    bookCountOne: '1 book',
    storageRecovered: 'We freed {size} of missing downloads.',
    notifications: 'Notifications',
    notificationsBody: 'We can tell you the moment a story is finished.',
    notificationsUnavailable: 'Notifications are not switched on for this app yet.',
    notificationsDenied:
      'Notifications are turned off for Nagilai in your phone settings. Open Settings to allow them.',
    openPhoneSettings: 'Open phone settings',
    enableNotifications: 'Tell me when a story is ready',
    quietHours: 'Quiet hours',
    quietHoursOff: 'Off',
    quietHoursValue: 'No notifications between {from} and {to}',
    yourData: 'Your data',
    yourDataBody:
      'You can download everything in your account, or delete it permanently, from your account settings on the web.',
    openAccountSettings: 'Open account settings',
    privacyNote: 'Your child’s details are never public and are never used to train any model.',
    signOut: 'Sign out',
    signOutTitle: 'Sign out?',
    signOutBody: 'Books saved on this device will be removed.',
  },

  notifications: {
    permissionTitle: 'Tell you when it is ready?',
    permissionBody:
      'A story takes a minute or two. We can send one notification when the book is finished, and nothing else.',
    allow: 'Yes, tell me',
    notNow: 'Not now',
  },

  errors: {
    outOfCredits: 'You have used all your story credits.',
    signInAgain: 'Please sign in again.',
    timeout: 'That took too long. Check your connection and try again.',
  },
} as const;

/**
 * Widens the literal types so a translation may differ from the English
 * text while still requiring exactly the same keys.
 */
export type Dictionary = {
  readonly [Section in keyof typeof en]: {
    readonly [Key in keyof (typeof en)[Section]]: string;
  };
};
