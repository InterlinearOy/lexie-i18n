// Generate a starter screen map. The review page groups strings by screen in
// reading order, because tone is a property of a screen's copy as a whole and
// an alphabetical dump hides it. Most namespaces already are a screen, so this
// derives what it can and leaves the rest to be named by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NAMES = {
  'app:welcome': 'Onboarding — welcome', 'app:onboarding': 'Onboarding',
  'app:nameInput': 'Onboarding — name', 'app:topicOrLanguage': 'Onboarding — topic',
  'app:termsAndLanguage': 'Onboarding — terms', 'app:onboardingPaywall': 'Onboarding — paywall',
  'app:home': 'Home', 'app:scanPage': 'Scan a page', 'app:textUpload': 'Paste text',
  'app:studySet': 'Study set', 'app:quiz': 'Quiz', 'app:quizComplete': 'Quiz results',
  'app:flashcards': 'Flashcards', 'app:flashcardResults': 'Flashcard results',
  'app:think': 'Think', 'app:math': 'Math', 'app:typedRecall': 'Typed recall',
  'app:conceptCards': 'Concept cards', 'app:occlusion': 'Image occlusion',
  'app:focusMode': 'Focus mode', 'app:review': 'Spaced repetition',
  'app:folders': 'Folders', 'app:folder': 'Folder', 'app:lessonHistory': 'My sets',
  'app:settings': 'Settings', 'app:profileSettings': 'Profile settings',
  'app:profileImage': 'Profile image', 'app:fontSettings': 'Font settings',
  'app:studySetSettings': 'Study set settings', 'app:notifications': 'Notifications',
  'app:proPass': 'Pro pass', 'app:passes': 'Passes', 'app:proWelcome': 'Pro welcome',
  'app:postCreatePaywall': 'Paywall after create', 'app:referral': 'Referral',
  'app:rewardCode': 'Reward code', 'app:giftModal': 'Gift', 'app:login': 'Log in',
  'app:prep': 'Prep library', 'app:chat': 'Chat', 'app:feedback': 'Feedback',
  'app:alerts': 'Alerts', 'app:common': 'Shared labels', 'app:preview': 'Preview',
  'app:progressive': 'Creating a set', 'app:translation': 'Translation',
  'app:picker': 'Picker', 'app:audioPremium': 'Audio', 'app:softPrompt': 'Prompts',
  'app:ratingPrompt': 'Rating prompt', 'app:spacedRepAnnouncement': 'Spaced repetition intro',

  'web:heroCreate': 'Landing — hero', 'web:pricing': 'Landing — pricing',
  'web:unlimited': 'Unlimited modal', 'web:noAds': 'Landing — no ads',
  'web:paywall': 'Paywall', 'web:workspace': 'Workspace',
  'web:honorCode': 'Honor code', 'web:termsPage': 'Terms', 'web:privacyPage': 'Privacy',
  'web:creatorProgram': 'Creator program',
  'web:study.quiz': 'Quiz', 'web:study.flashcards': 'Flashcards',
  'web:study.thinkExam': 'Think', 'web:study.prepThink': 'Prep think',
  'web:study.modes': 'Study modes', 'web:study.shell': 'Study shell',
  'web:study.typedRecall': 'Typed recall', 'web:study.saveSetModal': 'Save set',
  'web:study.sharedViewer': 'Shared set', 'web:study.tryPage': 'Try Lexie',
  'web:study.prepHub': 'Prep hub', 'web:study.prepGuide': 'Study guide',
  'web:study.prepFolderCard': 'Prep folder', 'web:study.prepGate': 'Prep activation',
  'web:study.courseView': 'Course', 'web:study.coursesIndex': 'Courses',
  'web:study.blankFeedback': 'Blank feedback',
};

// Flat top-level web keys that belong to a named section of the landing page.
const LANDING = {
  metaDescription: 'Landing — page metadata', insightsNav: 'Header', headerLogin: 'Header',
  faq: 'Landing — FAQ', whyDifferent: 'Landing — FAQ', whyDifferentAnswer: 'Landing — FAQ',
  howLexieWorks: 'Landing — FAQ', howLexieWorksAnswer: 'Landing — FAQ',
  whatCanLearn: 'Landing — FAQ', whatCanLearnAnswer: 'Landing — FAQ',
  howToUse: 'Landing — FAQ', howToUseAnswer: 'Landing — FAQ',
  materialsStored: 'Landing — FAQ', materialsStoredAnswer: 'Landing — FAQ',
  faqMaterialsBest: 'Landing — FAQ', faqMaterialsBestAnswer: 'Landing — FAQ',
  faqTextLexie: 'Landing — FAQ', faqTextLexieAnswer: 'Landing — FAQ',
  storyTitle: 'Landing — story', storyP1: 'Landing — story', storyP2: 'Landing — story',
  storyP3: 'Landing — story', storyP4: 'Landing — story',
  testimonials: 'Landing — testimonials', testimonialsTitle: 'Landing — testimonials',
  testimonialsRating: 'Landing — testimonials',
  videoTestimonialsTitle: 'Landing — testimonials', videoTestimonialsSubtitle: 'Landing — testimonials',
  privacy: 'Footer', terms: 'Footer', termsOfService: 'Footer', privacyPolicy: 'Footer',
  locale: 'Landing — page metadata',
};

const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [p + k]
  );

const out = {};
const unnamed = new Set();
let order = 0;

for (const target of ['app', 'web']) {
  for (const key of flat(bundle(target, 'en'))) {
    const parts = key.split('.');
    const group = target === 'web' && parts[0] === 'study'
      ? `${parts[0]}.${parts[1]}`
      : parts[0];
    const id = `${target}:${group}`;
    // The web landing page is a flat set of top-level keys rather than a
    // namespace, so anything unnamespaced on web belongs to it.
    const screen = NAMES[id] ?? (target === 'web' && parts.length <= 2 ? LANDING[group] ?? 'Landing page' : null);
    if (!screen) unnamed.add(id);
    out[`${target}:${key}`] = { screen: screen ?? null, order: order++ };
  }
}

fs.writeFileSync(path.join(ROOT, 'meta/screens.json'), JSON.stringify(out, null, 2) + '\n');
const named = Object.values(out).filter((v) => v.screen).length;
console.log(`${Object.keys(out).length} strings mapped, ${named} carry a screen name`);
if (unnamed.size) console.log('still to name by hand:', [...unnamed].join(', '));
