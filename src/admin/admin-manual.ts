import { PLAN_CONFIG } from "../config/plans";
import { GIFT_LENGTHS } from "../lib/gift-lengths";
import { AUDIENCE_TYPES, EMAIL_TEMPLATE_VARIABLES, TRAINING_STEPS, type AudienceType } from "./email-centre-api";
import { CAMPAIGN_PLANS } from "./email-plans";
import { READY_PROGRAMMES, daysText } from "./email-programmes";
import { INBOX_FILTERS, type InboxFilter } from "./inbox-api";
import { GIFT_STATE_LABEL, MEMBER_FILTERS, MEMBER_SORTS, type GiftCodeState, type MemberFilter } from "./members-api";

/**
 * The admin Manual: questions and answers about every part of the Email
 * Centre and the owner tools, each answered with steps to follow. Written
 * for the owner and for anyone who works for them.
 *
 * How the text is written:
 *  - *Words between stars* are something you see on screen: a tab, a button,
 *    a field or a message. They are shown in bold, and tests/admin-manual.test.ts
 *    checks that each one really appears in the admin's screens, so the steps
 *    cannot quietly go out of date when a screen changes.
 *  - `Words between backticks` are values to type or copy exactly.
 *  - Every answer has steps. Lists of meanings go in `points`.
 *  - British spelling, short sentences, no jargon where a plain word works.
 *
 * Lists that already exist in the app (member groups, audiences, plans,
 * programmes, template variables, gift lengths, plan prices and limits) are
 * built from the app's own lists, so the manual always shows what the
 * screens offer.
 */

export interface ManualEntry {
  /** Stable id, used in links: /admin/email-centre?tab=manual&q=<id>. */
  id: string;
  /** The question, as someone would ask it. */
  q: string;
  /** The short answer, one to three sentences. */
  a: string;
  /** What to do, in order. Every entry has steps. */
  steps: readonly string[];
  /** Meanings, options or reasons, when the answer needs a list. */
  points?: readonly string[];
  /** The heading over `points`. */
  pointsTitle?: string;
  /** Things that are good to know. */
  tips?: readonly string[];
  /** Ids of questions worth reading next. */
  related?: readonly string[];
}

export interface ManualTopic {
  id: string;
  title: string;
  /** The topic's button in the Manual tab. */
  short: string;
  intro: string;
  entries: readonly ManualEntry[];
}

/**
 * Numbers the manual quotes that are set in the server's code. The test
 * compares each one with the code, so a change there fails the test until
 * the manual says the same.
 */
export const MANUAL_FACTS = {
  /** server/email-centre.ts SEND_BATCH_SIZE */
  campaignBatch: 20,
  /** server/email-centre.ts CRON_SEND_BUDGET */
  campaignPerRun: 40,
  /** server/email-centre.ts MAX_AUDIENCE */
  largestAudience: 10000,
  /** server/email-centre.ts: a hand-picked audience */
  handPicked: 50,
  /** server/programs.ts PROGRAM_SEND_BUDGET */
  programmePerRun: 10,
  /** server/programs.ts MAX_PROGRAM_STEPS */
  programmeEmails: 10,
  /** server/programs.ts MAX_DAYS */
  joinedMaxDay: 60,
  giftMaxDay: 30,
  /** server/programs.ts STALE_MS, in days */
  lateDays: 2,
  /** server/inbox-settings.ts MAX_OTHER_ADDRESSES */
  otherAddresses: 8,
  /** server/gift-codes.ts MAX_GIFT_USES */
  giftUses: 100000,
  /** server/gift-codes.ts MAX_CLAIM_DAYS */
  giftOpenDays: 730,
  /** server/members.ts PAGE_SIZE */
  membersPerPage: 50,
  /** server/inbox-core.ts */
  alertsPerDay: 50,
  attachmentsPerEmail: 10,
  attachmentMb: 10,
  attachmentsTotalMb: 25,
  /** server/platform.ts rate limits */
  signInTries: 12,
  signInMinutes: 15,
  resetLinksPerHour: 3,
  /** src/admin/EmailCentre.tsx: "Days without a download" */
  quietMinDays: 7,
  quietMaxDays: 365,
  /** server/email.ts: the confirmation email */
  confirmLinkHours: 24,
  /** Resend's prices (resend.com/pricing, checked October 2026) */
  resendFreePerDay: 100,
  resendFreePerMonth: 3000,
  resendProDollars: 20,
  resendProPerMonth: 50000,
} as const;

const F = MANUAL_FACTS;
const n = (value: number) => value.toLocaleString("en-GB");

const free = PLAN_CONFIG.free;
const flow = PLAN_CONFIG.sceneflow;
const forge = PLAN_CONFIG.sceneforge;
const plural = (count: number | null, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const lengthsText = (() => {
  const labels = GIFT_LENGTHS.map((entry) => entry.label);
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
})();
const freeDownloads = `${plural(free.limits.shortExportsPerWeek, "Short", "Shorts")} and ${plural(free.limits.longExportsPerWeek, "long video", "long videos")} a week`;
const flowDownloads = `${flow.limits.finalExportsPerWeek} downloads a week`;
const price = (plan: typeof flow) => `$${plan.prices.monthly} a month or $${plan.prices.yearly} a year`;

/** What each member group means, in full. The test checks every group has one. */
export const MEMBER_GROUP_TEXT: Record<MemberFilter, string> = {
  all: "every member, except the owner account.",
  free: "on the Free plan, with no gift running.",
  paying: "paying for SceneFlow or SceneForge.",
  gift: "on free time that is still running, given by you or from a gift code.",
  new: "made their account in the last 30 days.",
  no_video: "have never downloaded a finished video.",
  quiet: "have not downloaded a video in the last 30 days.",
  unconfirmed: "never clicked the link in their confirmation email. They cannot sign in until they do.",
};

/** What each Inbox filter shows. The test checks every filter has one. */
export const INBOX_FILTER_TEXT: Record<InboxFilter, string> = {
  needs_reply: "New or Open conversations where the customer wrote last. This is your to-do list, and the number on the Inbox tab.",
  all: "every conversation except spam.",
  new: "nobody has answered yet.",
  open: "you have replied, or the customer wrote again, and it is still going.",
  resolved: "answered and finished.",
  closed: "finished without needing an answer, for example automatic emails such as out-of-office replies.",
  spam: "junk, including emails that failed the sender checks. Spam has no reply box.",
};

/** Notes added to the audiences in New campaign. */
const AUDIENCE_NOTES: Partial<Record<AudienceType, string>> = {
  registered_range: "Fill in *Registered from* and *Registered to*.",
  training_step: `Choose the *Training step*. Nothing moves members along the steps yet, so every member is at the first step (${TRAINING_STEPS[0]}). For emails spread over time, use *Programmes* instead.`,
  manual: "Find people with *Search consented users* and select them.",
  test_recipient: "Type the *Test recipient address*.",
  inactive: `Choose *Days without a download*, from ${F.quietMinDays} to ${F.quietMaxDays}.`,
};

/** What each gift code state means and what to do. The test checks every state has one. */
export const GIFT_STATE_TEXT: Record<GiftCodeState, string> = {
  active: "people can use it.",
  paused: "you paused it. Nobody can use it until you select *Start again*.",
  ended: "you ended it. It can never be used or started again. Make a new code instead.",
  expired: "the last day to use it has passed. Select *Change* to give it a later last day, or make a new code.",
  used_up: "as many people as you allowed have used it. Select *Change* to raise the number.",
};

/** What each campaign status means. The test checks every status in src/db.ts has one. */
export const CAMPAIGN_STATUS_TEXT: Record<string, string> = {
  draft: "saved, not sent. You can still test it, send it or cancel it.",
  scheduled: "waiting for its time. It goes out within five minutes of that time.",
  sending: "going out in batches right now.",
  sent: "handed to the email provider.",
  completed: "finished, with no failures.",
  partially_failed: "finished, but some emails could not be sent. Look at *Recent failures* in the campaign.",
  failed: "finished, and no email could be sent. Check the warning on *Dashboard* and today's sending limit.",
  cancelled: "you stopped it. People already emailed stay emailed; nobody else is emailed.",
};

/** The messages a customer can see when a gift code cannot be used, with what to do. */
export const GIFT_REFUSALS: ReadonlyArray<{ message: string; meaning: string }> = [
  { message: "This gift code has ended.", meaning: "You ended the code. Make a new one, or give them free time in *Members*." },
  { message: "This gift code is not available right now. Please try again later.", meaning: "The code is paused. Select *Start again* if it should be open." },
  { message: "This gift code has expired.", meaning: "Its last day has passed. Select *Change* to give it a later last day, or make a new code." },
  { message: "This gift code is for new members only.", meaning: "The code is for people who join from now, and this person already had an account. Give them free time in *Members* if it is fair." },
  { message: "You have already used this gift code.", meaning: "Each person can use a code once. Nothing to fix." },
  { message: "This gift code has been used up.", meaning: "As many people as you allowed have used it. Select *Change* to raise the number." },
  { message: "Your plan already includes everything in this gift.", meaning: "They pay for a plan at least as good as the gift. Nothing to fix." },
  { message: "You already have a gift that is at least as good and lasts longer.", meaning: "The gift they have now is better. Nothing to fix." },
  { message: "This access code is invalid, expired, revoked, or already used.", meaning: "The code does not exist, often a typing mistake. Check the spelling with them. Codes are not case sensitive." },
];

/** Why a programme email was not sent, with what to do. The test checks every reason in the server is here. */
export const PROGRAMME_REASONS: ReadonlyArray<{ reason: string; meaning: string }> = [
  { reason: "Does not want marketing email", meaning: "The member did not agree to marketing email, or unsubscribed. Nothing to do." },
  { reason: "Email address not confirmed", meaning: "They never clicked their confirmation link." },
  { reason: "Made a video, so the programme stopped", meaning: "The programme stops when a member makes a video, and this one did. That is the goal." },
  { reason: "Started paying, so the programme stopped", meaning: "The programme stops when a member starts paying, and this one did." },
  { reason: "The gift ended early or was replaced", meaning: "The gift this reminder was about is no longer running." },
  { reason: "This email was removed from the programme", meaning: "You removed the email with *Change* before it was sent." },
  { reason: "More than two days late, so it was not sent", meaning: "Sending was held up for a while. Old emails are not sent late, so nobody gets a welcome weeks after joining." },
  { reason: "The email's template was deleted or archived", meaning: "Restore the template in *Templates* (tick *Show archived*, then *Restore*), or choose another template with *Change*." },
  { reason: "The programme was switched off", meaning: "Emails waiting when you switched the programme off are dropped." },
  { reason: "Too late: this email was added after its day had passed", meaning: "You added an email to the programme after that member's day for it had gone by." },
  { reason: "Too late: the gift ends sooner than this email's day", meaning: "The gift ends too soon for this reminder, for example a one-week gift and a reminder a week before the end." },
  { reason: "Owner accounts do not get programme emails", meaning: "The owner account is always left out." },
  { reason: "The account no longer exists", meaning: "The account was deleted." },
  { reason: "The email address is not valid", meaning: "The address on the account cannot receive email." },
];

/** "a, b and c" */
const listText = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** When a plan's emails go out, in words: "3 emails: the first straight away, then after 2 and 5 days." */
function planTiming(days: readonly number[]): string {
  if (days.length === 1) return "One email.";
  if (days[0] === 0) return `${days.length} emails: the first straight away, then after ${listText(days.slice(1).map(String))} days.`;
  return `${days.length} emails, after ${listText(days.map(String))} days.`;
}

/** When a programme's emails go out, in words. */
function programmeTiming(trigger: "joined" | "gift_ending", days: readonly number[]): string {
  if (trigger === "gift_ending") {
    const before = [...days].sort((a, b) => b - a).map((day) => (day === 0 ? "on the day" : day === 1 ? "1 day" : `${day} days`));
    return `${listText(before)} before the gift ends`;
  }
  return daysText(trigger, [...days]);
}

const planPoints = CAMPAIGN_PLANS.map((plan) => `*${plan.name}*: ${plan.goal} Who: ${lowerFirst(plan.audience.label)}. ${planTiming(plan.emails.map((email) => email.day))} ${plan.when}`);

const programmePoints = READY_PROGRAMMES.map((programme) => `*${programme.name}*: ${programme.goal} ${plural(programme.steps.length, "email", "emails")}, ${programmeTiming(programme.trigger, programme.steps.map((step) => step.day))}.`);

export const ADMIN_MANUAL: readonly ManualTopic[] = [
  {
    id: "start",
    title: "Getting started",
    short: "Getting started",
    intro: "What the admin is, how to open it, what to set up first and what to check each day.",
    entries: [
      {
        id: "open-admin",
        q: "How do I open the admin?",
        a: "The admin is called the Email Centre. Only the owner account can open it.",
        steps: [
          "Sign in to Scenering with the owner account.",
          "Select *Menu* in the top right corner of any Scenering page.",
          "Select *Email Centre*. It opens on the *Dashboard* tab.",
          "Bookmark the page so you can come straight back. The address is `scenering.com/admin/email-centre`.",
        ],
        tips: [
          "The tab you are on is kept in the page address, so a bookmark of a tab opens that tab.",
          "To go back to making videos, select *Open Studio* at the top of the Email Centre.",
        ],
        related: ["tabs-overview", "first-setup"],
      },
      {
        id: "tabs-overview",
        q: "What is each tab for?",
        a: "Each tab looks after one job. You can open them in any order.",
        steps: [
          "Open the Email Centre.",
          "Select a tab along the top. The list below says what each one is for.",
          "Come back to *Manual* whenever you need the steps for a job.",
        ],
        pointsTitle: "The tabs",
        points: [
          "*Dashboard*: the numbers. How many members there are, how many agreed to marketing email, and how your campaigns did.",
          "*Inbox*: messages from the contact form and emails sent to your Scenering addresses. You answer them here.",
          "*Members*: everyone with an account, their plan and videos. Give one member free time or write to them.",
          "*Gifts*: gift codes to share with many people, and the results of each code.",
          "*Plans*: ready-made email series that create the templates and campaigns for you.",
          "*Programmes*: emails that go out by themselves, to each member at the right moment for them.",
          "*Templates*: the emails themselves: subject, text and layout.",
          "*Campaigns*: sending one template to a group of members, now or later, and the results.",
          "*Manual*: these questions and answers.",
        ],
      },
      {
        id: "first-setup",
        q: "What should I set up first?",
        a: "Do these once, in this order. Until they are done, customers' emails cannot reach the Inbox and marketing emails are missing details the law requires.",
        steps: [
          "Open *Inbox*, then *Email settings*. Under *Your business details in marketing emails*, fill in *Business name*, *Physical address* and *Phone number*, then select *Save settings*.",
          "In *Inbox*, select *Connect address* and do the steps under *One-time setup in Cloudflare (about 5 minutes)*.",
          "In Cloudflare, add one routing rule for each of your other addresses (support, hello and billing), the same way.",
          "From a different email account, send a test email to your address. Check that it appears in the *Inbox* within a minute.",
          "Open *Email settings* again, switch on *Replies to automatic Scenering emails go to* your address, and select *Save settings*.",
          "Open *Dashboard*. If it warns that the email provider is not configured, emails are not really going out yet.",
        ],
        related: ["connect-address", "business-details", "reply-to-automatic", "provider-not-configured"],
      },
      {
        id: "daily-routine",
        q: "What should I check every day and every week?",
        a: "A short routine keeps customers answered and your emails working.",
        steps: [
          "Every day: open *Inbox* and select *Needs reply*. The number on the *Inbox* tab is how many conversations wait for you. Answer them and mark finished ones *Resolved*.",
          "Every day: look at *Dashboard* for *Failed* and *Bounced* emails.",
          "Every week: open *Members* and look at *Joined in the last 30 days* and *No video yet*. These are the people to help.",
          "Every week: open *Gifts* and compare your codes: who used them, who made a video and who went on to pay.",
          "Every week: open *Programmes* and select *What happened* on each programme that is switched on.",
          "Every month: plan one campaign, or use a plan from *Plans*.",
        ],
        related: ["inbox-reply", "gift-results", "prog-activity"],
      },
      {
        id: "staff-access",
        q: "Can someone who works for me have their own admin login?",
        a: "Not at the moment. Only one account can open the admin: the account whose email address is set as the owner in the server settings (SCENERING_OWNER_EMAIL in Cloudflare).",
        steps: [
          "If someone helps you now, they have to sign in with the owner account.",
          "Remember that the owner account can do everything: send to every member, give free time, change payment settings and see the keys in *API keys*.",
          "When someone stops working for you, change the owner password: select *Sign out*, then use *Forgot password?* on the sign-in page and set a new one.",
          "If you plan to take on staff, ask your developer for staff accounts first, so each person signs in as themselves.",
        ],
        tips: ["Never send the password by email or chat. Tell it in person or use a password manager."],
        related: ["password-reset"],
      },
      {
        id: "find-answers",
        q: "How do I find an answer quickly in this Manual?",
        a: "Search, or choose a topic, then open a question.",
        steps: [
          "Type a few words in *Search the manual*, for example `gift ends` or `reply`.",
          "Or select a topic button to see only that topic. Select *All topics* to see everything again.",
          "Select a question to open its answer, and select it again to close it.",
          "Select *Copy link* under an answer to copy a link straight to it, to send to someone who works for you.",
          "Words in bold are what you see on screen. Words in a grey box are values to type or copy exactly.",
        ],
      },
    ],
  },
  {
    id: "inbox",
    title: "Inbox: messages and replies",
    short: "Inbox",
    intro: "Messages from the contact form and emails sent to your Scenering addresses arrive here. You answer from here, and the customer gets your answer as a normal email.",
    entries: [
      {
        id: "inbox-where-from",
        q: "Where do the messages in the Inbox come from?",
        a: "From the contact form on the website, and from emails sent to your Scenering addresses (your personal address and the other addresses).",
        steps: [
          "Open *Inbox*. Each line is one conversation, newest first.",
          "Read the small text under the subject: it says where it started. Contact form, Email (with the address it was sent to), or Started by you.",
          "Select a conversation to read every message in it, oldest at the top.",
        ],
        tips: [
          "Emails only arrive once the address is connected in Cloudflare.",
          "Emails that fail the sender checks (DMARC) are filed under *Spam*. They never alert you and are never copied to you.",
          "Automatic emails (out-of-office replies, newsletters, delivery notices) are filed as *Closed*. They are kept, but never put a conversation back on *Needs reply*.",
        ],
        related: ["connect-address", "inbox-filters"],
      },
      {
        id: "inbox-filters",
        q: "What do Needs reply, New, Open, Resolved, Closed and Spam mean?",
        a: "They sort conversations by where they are. Use Needs reply as your to-do list.",
        steps: [
          "Open *Inbox*.",
          "Select a button above the list to see only those conversations. The number on each button is how many there are.",
          "Open a conversation and select another status under its subject to move it.",
        ],
        pointsTitle: "What each one shows",
        points: INBOX_FILTERS.map((entry) => `*${entry.label}*: ${INBOX_FILTER_TEXT[entry.value]}`),
        tips: ["When someone writes again in a Resolved or Closed conversation, it opens again by itself and goes back on *Needs reply*."],
        related: ["inbox-status-change"],
      },
      {
        id: "inbox-reply",
        q: "How do I answer a message?",
        a: "Open the conversation, write in the reply box at the bottom and send. Your signature is added for you.",
        steps: [
          "Open *Inbox* and select *Needs reply*.",
          "Select the conversation and read every message. The newest is at the bottom.",
          "Look at the member box under the subject: their plan, how long they have been a member, and whether they want marketing email. If it says they do not have a Scenering account yet, they are not a member, or they wrote from another address.",
          "In the reply box, check *From:*. Change it if the answer should come from another of your addresses.",
          "Write your answer where it says *Write your reply…*, or select a saved reply above the box and change it to fit.",
          "Select *Send reply* to send it and keep the conversation open, or *Send and mark resolved* when nothing more is needed.",
          "Check the message under the box. *Reply sent.* means it went out; otherwise it says why it could not be sent.",
        ],
        tips: [
          "Your signature from *Email settings* and the customer's last message are added below your answer.",
          "The customer can answer your email as normal. Their answer arrives in the same conversation.",
          "If sending fails, your text stays in the box. Fix the problem and send again.",
        ],
        related: ["inbox-from-address", "inbox-saved-replies", "inbox-reply-failed"],
      },
      {
        id: "inbox-from-address",
        q: "How do I choose which address my reply comes from?",
        a: "A reply starts on the address the customer wrote to. Use your personal address when you want it to feel personal, and support, hello or billing for everything else.",
        steps: [
          "Open the conversation.",
          "In the reply box, open the list next to *From:*.",
          "Choose the address. Your personal address is marked (personal).",
          "Write and send as usual. The customer's answer comes back to this conversation, whichever address you used.",
        ],
        tips: ["Only your own Scenering addresses are in the list. To add one, see the question about adding another address."],
        related: ["other-addresses", "personal-address"],
      },
      {
        id: "inbox-new-message",
        q: "How do I write a new message to someone?",
        a: "Use New message for a one-to-one email. It starts a new conversation in the Inbox.",
        steps: [
          "Open *Inbox* and select *New message*.",
          "Choose the address it comes from in *From*.",
          "Type their email address in *To*.",
          "Fill in *Subject* and *Message*.",
          "Select *Send*. Their answer arrives in the Inbox.",
        ],
        tips: [
          "To write to a member, you can also open them in *Members* and select *Write to* and their name. The address is filled in for you.",
          "Use this for one-to-one messages only. Marketing to many members goes in a campaign, which checks agreement and adds the unsubscribe link.",
        ],
        related: ["write-to-member", "law-who"],
      },
      {
        id: "inbox-saved-replies",
        q: "How do I make and use saved replies?",
        a: "Saved replies are answers you write once and insert with one click.",
        steps: [
          "Open *Inbox* and select *Saved replies*.",
          "Under *Add a saved reply*, give it a *Title* (only you see it) and write the *Text*. Type `{{first_name}}` where the customer's first name should go.",
          "Select *Add*.",
          "To change one, select *Edit*, make the change and select *Save changes*. To remove one, select *Delete*.",
          "When you answer a conversation, the titles appear above the reply box. Select one to put its text into your answer, then change it to fit.",
        ],
        tips: ["If the customer gave no name, `{{first_name}}` becomes \"there\", as in \"Hi there\"."],
      },
      {
        id: "inbox-status-change",
        q: "How do I mark a conversation resolved, closed or spam?",
        a: "Select the status under the conversation's subject. It is saved straight away.",
        steps: [
          "Open the conversation.",
          "Under the subject, select *New*, *Open*, *Resolved*, *Closed* or *Spam*.",
          "To keep it bold in the list as a reminder, select *Mark unread*.",
          "Select *Back to inbox* to return to the list.",
        ],
        tips: ["*Send and mark resolved* in the reply box answers and resolves in one go."],
        related: ["inbox-filters"],
      },
      {
        id: "inbox-delete",
        q: "How do I delete a conversation?",
        a: "Delete removes the conversation and its attachments for good. It cannot be undone.",
        steps: [
          "Open the conversation.",
          "Select *Delete* at the top.",
          "Read the question and confirm.",
        ],
        tips: ["Usually *Resolved*, *Closed* or *Spam* is better: the history is still there if the customer writes again. Delete when someone asks you to remove their messages."],
        related: ["delete-account"],
      },
      {
        id: "inbox-attachments",
        q: "How do I open attachments?",
        a: "Attachments are listed under their message and are downloaded, never opened in the page.",
        steps: [
          "Open the conversation.",
          "Find the file names under the message they came with. Each shows its size.",
          "Select a file to download it.",
          "Only open files you expect from people you know. Never open an unexpected program or a document that asks to turn on macros.",
        ],
        tips: [`Up to ${F.attachmentsPerEmail} files per email are kept, ${F.attachmentMb} MB each and ${F.attachmentsTotalMb} MB in total. A file that was not kept shows its name with the reason, for example \"not kept\".`],
      },
      {
        id: "inbox-member-gift",
        q: "How do I give free time to the person I am talking to?",
        a: "If they have an account, the member box in the conversation can give a month or a year straight away.",
        steps: [
          "Open the conversation. The member box shows their plan.",
          "Under *Gift access*, choose *SceneFlow* or *SceneForge*.",
          "Choose *1 month* or *1 year*.",
          "Select *Give*. The member box shows the gift straight away.",
        ],
        tips: [
          "For other lengths, or to end a gift, open the member in *Members*.",
          "A new gift replaces a gift that is running. It never charges anything and never changes a paid subscription.",
        ],
        related: ["give-free-time", "end-gift"],
      },
      {
        id: "inbox-search",
        q: "How do I find an old conversation?",
        a: "Search looks through names, email addresses, subjects and message text.",
        steps: [
          "Open *Inbox*.",
          "Select *All*, so finished conversations are included. Select *Spam* to search spam.",
          "Type a name, email address, subject or words from the message in *Search name, email, subject or text*.",
          "Select *Show more* at the bottom of the list if what you need is not shown yet.",
        ],
      },
      {
        id: "inbox-alerts",
        q: "How do I get an email when a message arrives?",
        a: "Switch on alerts for the contact form, and copies of every email to your addresses, in Email settings.",
        steps: [
          "Open *Inbox*, then *Email settings*.",
          "Switch on *Email me when a contact-form message arrives* and fill in *Address for alerts*.",
          "To get a copy of every email sent to your addresses in your own mailbox, switch on *Send a copy of every incoming email to* and fill in *Address for copies*.",
          "Select *Save settings*.",
          "The copy address must be verified once in Cloudflare: see *Connect address*.",
        ],
        tips: [
          `Alerts stop after ${F.alertsPerDay} in a day, so a flood of messages cannot fill your mailbox.`,
          "Always answer from the Inbox, not from the copy in your own mailbox. Then the answer comes from your Scenering address and the whole conversation stays in one place.",
        ],
        related: ["connect-address"],
      },
      {
        id: "inbox-not-receiving",
        q: "Why does the Inbox say Not receiving email yet?",
        a: "No email has arrived at your address yet, usually because the Cloudflare setup is not finished.",
        steps: [
          "Open *Inbox* and select *Connect address* (or *Show me how* in the yellow notice).",
          "Read the three checks at the top: whether Cloudflare handles email for scenering.com, whether an email has arrived, and whether sending replies is set up.",
          "Do the steps under *One-time setup in Cloudflare (about 5 minutes)* for each check that is not done.",
          "Send a test email from a different email account than your copy address, wait a minute, and select *Check again*.",
        ],
        related: ["connect-address"],
      },
    ],
  },
  {
    id: "addresses",
    title: "Email addresses and settings",
    short: "Addresses and settings",
    intro: "Your personal address, the other addresses, who campaign emails come from, and the details every marketing email must carry. All of it is in Inbox, Email settings.",
    entries: [
      {
        id: "connect-address",
        q: "How do I connect my address so emails arrive in the Inbox?",
        a: "Once, in the Cloudflare dashboard. It takes about five minutes and costs nothing.",
        steps: [
          "Open the Cloudflare dashboard and go to *Compute*, then *Email Service*, then *Email Routing*. Select *Onboard Domain*, choose scenering.com and select *Done*. Cloudflare adds the mail records itself.",
          "Open *Destination Addresses*, add your own mailbox (where copies should go) and click the link in the email Cloudflare sends you.",
          "Open *Routing Rules* and select *Create routing rule*. Email pattern: `vincent`. Action: *Send to a Worker*. Worker: `scenering`. Select *Save*.",
          "Create one more rule the same way for each other address: `support`, `hello` and `billing`.",
          "From a different email account than your copy address, send a test email to vincent@scenering.com and to each other address.",
          "In the Scenering *Inbox*, select *Connect address*, then *Check again*. The checks show what is done.",
          "Then open *Email settings* and switch on replies to automatic emails.",
        ],
        tips: ["Some email providers hide a message that looks like it came from themselves. That is why the test must come from a different account."],
        related: ["reply-to-automatic", "other-addresses"],
      },
      {
        id: "personal-address",
        q: "What is my personal address for?",
        a: "vincent@scenering.com is the address to use when you want customers to feel you are talking to them yourself.",
        steps: [
          "Open *Inbox*, then *Email settings*.",
          "*Your personal address* is where customers can write to you, and replies come from it unless you choose another address.",
          "Set *Name on your replies*, for example Vincent from Scenering, and a *Signature*.",
          "Select *Save settings*.",
        ],
        tips: ["Keep it for personal conversations. Use support or hello for everyday help, so your personal address stays special."],
        related: ["inbox-from-address"],
      },
      {
        id: "other-addresses",
        q: "How do I add another address, like jobs@?",
        a: `Add it in Email settings and you can send from it straight away. Customers' emails to it arrive once it has a routing rule in Cloudflare. You can have up to ${F.otherAddresses} other addresses.`,
        steps: [
          "Open *Inbox*, then *Email settings*.",
          "Under *Other addresses*, select *Add an address*.",
          "Type the *Address*. It must end in @scenering.com.",
          "Type the *Name on replies from this address* and, if you want, a *Signature*.",
          "Select *Save settings*.",
          "In Cloudflare, create a routing rule for it: the part before @ as the email pattern, *Send to a Worker*, Worker `scenering`.",
          "Send a test email to it from another account and check that it arrives in the *Inbox*.",
        ],
        tips: ["To remove an address, select *Remove* next to it and then *Save settings*. Also delete its routing rule in Cloudflare."],
        related: ["connect-address"],
      },
      {
        id: "reply-to-automatic",
        q: "What does Replies to automatic Scenering emails do?",
        a: "When it is on, a member who answers any automatic email from Scenering (a confirmation email, a campaign sent from noreply) reaches your Inbox instead of nowhere.",
        steps: [
          "First make sure a test email to your address has arrived in the *Inbox*.",
          "Open *Inbox*, then *Email settings*.",
          "Switch on *Replies to automatic Scenering emails go to* (it shows your address).",
          "Select *Save settings*.",
        ],
        tips: [
          "Switch it on only after the test email arrived. Otherwise answers would go to an address that does not deliver yet.",
          "Plans and programmes invite members to reply, so this switch matters for them.",
        ],
        related: ["connect-address", "campaign-sender"],
      },
      {
        id: "campaign-sender",
        q: "Who do campaign emails come from, and how do I change it?",
        a: "Campaign and programme emails come from noreply@scenering.com unless you choose one of your own addresses.",
        steps: [
          "Open *Inbox*, then *Email settings*.",
          "Find *Campaign emails come from*.",
          "Choose noreply for emails nobody should answer, or one of your own addresses so answers reach the Inbox.",
          "Select *Save settings*. Every campaign, programme email and test from then on uses it.",
        ],
        tips: [
          "The plans are written as notes from you. Sent from your personal address, they read like a personal note and answers arrive in the Inbox.",
          "If you remove the address chosen here, campaigns go back to noreply.",
        ],
        related: ["reply-to-automatic", "plans-replies"],
      },
      {
        id: "business-details",
        q: "Why must I fill in my business details, and how?",
        a: "South African rules require your name, physical address and phone number in every marketing email. Scenering adds them to the footer of every campaign and programme email.",
        steps: [
          "Open *Inbox*, then *Email settings*.",
          "Under *Your business details in marketing emails*, fill in *Business name*, *Physical address* (street, town, postal code) and *Phone number*.",
          "Select *Save settings*.",
          "Open any campaign in *Campaigns*, use *Send a test email* to send one to yourself, and check the footer.",
        ],
        related: ["law-every-email"],
      },
      {
        id: "provider-not-configured",
        q: "Why does the Dashboard say the email provider is not configured?",
        a: "Emails are not really leaving Scenering. The server writes them to its log instead of sending them.",
        steps: [
          "On a test copy of Scenering this is normal. It should never show on the live site.",
          "On the live site, open the Cloudflare dashboard, open the `scenering` Worker's settings and look at its variables and secrets.",
          "Check that EMAIL_PROVIDER is `resend` and that the RESEND_API_KEY secret is set.",
          "Open *Dashboard* again. The warning is gone once both are right.",
        ],
        related: ["daily-limit"],
      },
    ],
  },
  {
    id: "members",
    title: "Members",
    short: "Members",
    intro: "Everyone who has made a Scenering account, apart from the owner account.",
    entries: [
      {
        id: "find-member",
        q: "How do I find a member?",
        a: "Search by name or email address, or narrow the list with a group.",
        steps: [
          "Open *Members*.",
          "Type part of their name or email address in *Search name or email*. The list changes as you type.",
          "Or select a group button, for example *Paying*.",
          `Change *Order* to ${MEMBER_SORTS.map((entry) => `*${entry.label}*`).join(", ").replace(/, ([^,]*)$/, " or $1")}.`,
          `The list shows ${F.membersPerPage} members at a time. Select *Show more* at the bottom for the next ones.`,
          "Select a member to open everything about them.",
        ],
        related: ["member-groups", "member-details"],
      },
      {
        id: "member-groups",
        q: "What do the member groups mean?",
        a: "The buttons above the list show only the members in that group. The number on each is how many are in it.",
        steps: [
          "Open *Members*.",
          "Select a group button.",
          "Select *Everyone* to see all members again.",
        ],
        pointsTitle: "The groups",
        points: MEMBER_FILTERS.map((entry) => `*${entry.label}*: ${MEMBER_GROUP_TEXT[entry.value]}`),
        tips: ["*No video yet* and *Joined in the last 30 days* are the best groups to help. The *Finish a first video* plan and the *First video helper* programme are written for them."],
      },
      {
        id: "member-details",
        q: "What can I see about a member?",
        a: "Their plan, their videos, their gifts, the campaign emails Scenering sent them and your conversations with them.",
        steps: [
          "Open *Members* and select the member.",
          "*Plan* shows what they are on: Free, paying (monthly or yearly, with the renewal date) or a gift with its end date.",
          "*Videos* shows how many finished videos they downloaded and when.",
          "*Gifts so far* lists every gift, running or finished, with your notes.",
          "*Campaign emails* lists the campaigns they were sent.",
          "*Conversations* lists your Inbox conversations with them. Select one to open it.",
          "Select *Close* to go back to the list.",
        ],
        related: ["give-free-time", "write-to-member"],
      },
      {
        id: "give-free-time",
        q: "How do I give one member free time?",
        a: "Open the member and use Give free time. The gift starts straight away and never charges anything.",
        steps: [
          "Open *Members* and select the member.",
          "Go to *Give free time*.",
          "Under *For*, choose *SceneFlow* or *SceneForge*.",
          `Choose how long: ${lengthsText}.`,
          "If you want, write a *Note for yourself*, for example why you gave it. Only you see it.",
          "Select the *Give* button. It names the plan and length, for example Give SceneFlow for 1 month.",
          "The member sees the new plan the next time they open or reload the studio.",
        ],
        tips: [
          "If a gift is running, the window says *This replaces the gift running now.*",
          "A gift never changes a subscription the member pays for.",
          "To give the same gift to many people, make a gift code instead.",
        ],
        related: ["end-gift", "gift-make", "gift-ends"],
      },
      {
        id: "end-gift",
        q: "How do I end a member's gift early?",
        a: "Open the member and end the gift. They go back to Free, or to the plan they pay for.",
        steps: [
          "Open *Members* and select the member.",
          "Under *Give free time*, find *Running now:*.",
          "Select *End this gift* and confirm.",
          "Check the message *The gift has ended.*",
        ],
      },
      {
        id: "write-to-member",
        q: "How do I write to one member?",
        a: "From their page in Members. The Inbox opens with a new message to them.",
        steps: [
          "Open *Members* and select the member.",
          "Select *Write to* and their first name.",
          "The Inbox opens a *New message* with their address filled in. Choose *From*, then write the *Subject* and *Message*.",
          "Select *Send*.",
        ],
        related: ["inbox-new-message"],
      },
      {
        id: "no-marketing-email",
        q: "What does No marketing email mean on a member?",
        a: "The member did not agree to marketing email, or unsubscribed. Campaigns, plans and programmes leave them out by themselves.",
        steps: [
          "Open *Members*. The line under a member says *No marketing email* when this applies.",
          "You can still answer their messages and write to them one-to-one about their account.",
          "Only the member can switch marketing email on: in their account window under *Optional tutorials and product news*, or from the preferences link in any email.",
        ],
        related: ["law-who", "law-unsubscribe"],
      },
      {
        id: "member-unconfirmed",
        q: "A member never got their confirmation email. What do I do?",
        a: "Check that they really are unconfirmed, then get them to send the email again.",
        steps: [
          "Open *Members* and search for them. *Email not confirmed* under their name means they have not clicked the link yet.",
          "Ask them to look in their spam or junk folder for an email from Scenering with the subject Verify your Scenering email.",
          `The link works for ${F.confirmLinkHours} hours. If it is older, they should go to the sign-in page, type their email and password, select *Sign in*, and then select *Resend verification email*.`,
          "Check the spelling of their address with them. If it is wrong, they need to register again with the right address.",
          "If emails still do not arrive, look at *Dashboard* for failures and check today's sending limit.",
        ],
        related: ["daily-limit", "cant-sign-in"],
      },
      {
        id: "owner-not-listed",
        q: "Why am I not in the members list?",
        a: "The owner account is left out of the list and the numbers, so they only count customers.",
        steps: [
          "Open *Members*. Your own account is not shown in any group.",
          "To see the studio the way a customer does, use the plan preview.",
        ],
        related: ["plan-preview"],
      },
    ],
  },
  {
    id: "gifts",
    title: "Gift codes",
    short: "Gift codes",
    intro: "A gift code gives free time on SceneFlow or SceneForge to everyone who uses it. One code can be shared with many people, and each code shows its results.",
    entries: [
      {
        id: "gift-what",
        q: "What is a gift code, and when should I use one?",
        a: "One code that many people can use, each once. Use it to share free time widely; use Members to give one person free time.",
        steps: [
          "Use a gift code in a campaign, for a partner's audience (for example a YouTuber's viewers), in a social media post or at an event.",
          "For one person, open them in *Members* and use *Give free time* instead.",
          "Make a separate code for each place you share it, for example one for the newsletter and one for each partner. Then you can see which works best.",
        ],
        tips: [
          "A gift never charges anyone and never changes a paid subscription.",
          "People whose plan already includes the gift are told so and do not use up a place.",
        ],
        related: ["gift-make", "gift-share"],
      },
      {
        id: "gift-make",
        q: "How do I make a gift code?",
        a: "In Gifts, select Make a gift code and answer each question in the window.",
        steps: [
          "Open *Gifts* and select *Make a gift code*.",
          "*Name, for you*: write what the code is for, for example October newsletter or Partner: Jane's channel. Only you see it.",
          "*Plan*: choose *SceneFlow* or *SceneForge*.",
          `*Free for*: how long the gift lasts for each person: ${lengthsText}.`,
          "*How many people can use it*: choose *1 person*, 10, 50, 100 or *No limit*, or *Another number* and type it.",
          "*Who can use it*: choose *Anyone with an account*, or *Only people who join from now* for a code that should bring in new members.",
          "*People can use it for*: choose *7 days*, *14 days*, *30 days* or *90 days*, or *Until a date* and pick the *Last day to use it*.",
          "*The code*: choose *Make one for me*, or *I'll choose it* and type *Your code*: letters, numbers and dashes, 4 to 32 characters, for example WELCOME-OCT.",
          "Select *Make the code*. It appears at the top of the list with buttons to copy it.",
        ],
        tips: [
          "The plan and the length cannot be changed later. For a different gift, make a new code.",
          "Codes are not case sensitive: welcome-oct works the same as WELCOME-OCT.",
          "A code you choose cannot start with SCN-. Those are the older one-person codes.",
          `A code can stay open for up to two years and be used by up to ${n(F.giftUses)} people.`,
        ],
        related: ["gift-share", "gift-results"],
      },
      {
        id: "gift-share",
        q: "How do I share a gift code?",
        a: "Copy the link that suits the people you are sending it to, or the code itself.",
        steps: [
          "Open *Gifts* and find the code.",
          "For people without an account, select *Copy link for new people*. The link opens the sign-up page, and the gift is added when they sign in for the first time.",
          "For people who have an account, select *Copy link for members*. The link opens the studio and adds the gift.",
          "Or select *Copy code* to share just the code.",
          "Paste it into your email, post or message.",
        ],
        tips: [
          "For a campaign to members, the *Free month gift* plan writes the emails with the code and link for you.",
          "Give each partner their own code, so the results show what each partner brought in.",
        ],
        related: ["gift-customer-use", "plans-gift"],
      },
      {
        id: "gift-customer-use",
        q: "How does a customer use a gift code?",
        a: "Through one of the two links, or by typing the code in their account window.",
        steps: [
          "New person with the link for new people: they create an account, click the link in the confirmation email, then sign in. The gift is added as they sign in, and the studio shows the new plan straight away.",
          "Member with the link for members: they open it while signed in. The studio adds the gift and shows a message.",
          "Member with only the code: they select *Menu*, then *Account, membership & billing*, type the code under *Have a complimentary access code?* and select *Redeem code*.",
          "To check that it worked, open *Gifts* and select *Who used it* on the code.",
        ],
        tips: ["If something stops the gift at sign-in (for example the code is paused or used up), a new person is not told why and simply stays on Free. Check the code and give them the time in *Members* if it is fair."],
        related: ["gift-not-working", "gift-not-showing"],
      },
      {
        id: "gift-results",
        q: "How do I see who used a code and whether it worked?",
        a: "Each code in Gifts shows its numbers, and Who used it lists every person.",
        steps: [
          "Open *Gifts*. Each code shows five numbers.",
          "Select *Who used it* to see each person, when they used it, whether they made a video, and whether they went on to pay.",
          "Compare your codes. The one with the most people who made a video and went on to pay is the one to use again.",
        ],
        pointsTitle: "What the numbers mean",
        points: [
          "*used it*: people who used the code.",
          "*joined for it*: people who made their account after the code was made. These are new members it brought in.",
          "*still on the gift*: people whose gift from this code is still running.",
          "*made a video since*: people who downloaded a video after using the code.",
          "*went on to pay*: people who started a subscription after using the code.",
        ],
      },
      {
        id: "gift-pause-end",
        q: "How do I pause, restart or end a code?",
        a: "Pause stops a code for now, Start again opens it again, and End closes it for good. Gifts already given keep running in every case.",
        steps: [
          "Open *Gifts* and find the code.",
          "Select *Pause* to stop it for now. People who try it are told it is not available right now.",
          "Select *Start again* to open a paused code again.",
          "Select *End* and confirm to close it for good. An ended code can never be used, changed or started again.",
        ],
        related: ["gift-states"],
      },
      {
        id: "gift-change",
        q: "How do I change a code's name, number of people or last day?",
        a: "Use Change on the code. The plan and the length stay as they are.",
        steps: [
          "Open *Gifts* and select *Change* on the code.",
          "Change the *Name, for you*, *How many people can use it* or the *Last day to use it*.",
          "Select *Save*.",
        ],
        tips: [
          "The number of people cannot be lower than the number who already used it.",
          "For a different plan or length, make a new code.",
          "An ended code cannot be changed.",
        ],
        related: ["gift-states"],
      },
      {
        id: "gift-states",
        q: "What do Open, Paused, Ended, Past its last day and Used up mean?",
        a: "The word at the top of each code says whether people can use it now.",
        steps: [
          "Open *Gifts*.",
          "Read the word at the top of the code.",
          "Find it in the list below and do what it says.",
        ],
        pointsTitle: "The states",
        points: (Object.keys(GIFT_STATE_LABEL) as GiftCodeState[]).map((state) => `*${GIFT_STATE_LABEL[state]}*: ${GIFT_STATE_TEXT[state]}`),
      },
      {
        id: "gift-not-working",
        q: "A customer says their gift code did not work. What do I do?",
        a: "The message they saw says why. Match it with the list below.",
        steps: [
          "Ask for the exact message they saw, and the code.",
          "Open *Gifts*, find the code and read its state.",
          "Find their message in the list below and do what it says.",
          "If the code is fine but the gift is still fair, give them the same free time in *Members*.",
          "Answer them from the Inbox and say what you did.",
        ],
        pointsTitle: "Messages customers can see",
        points: GIFT_REFUSALS.map((entry) => `\"${entry.message}\" ${entry.meaning}`),
        related: ["gift-states", "give-free-time"],
      },
      {
        id: "gift-ends",
        q: "What happens when a gift ends?",
        a: "On its last day the member goes back to Free, or to the plan they pay for. Nothing is charged and nothing is deleted.",
        steps: [
          "To remind members before it ends, set up the *Gift ending reminder* programme in *Programmes* and switch it on.",
          "To see who is on a gift now, open *Members* and select *On a gift*.",
          "To give more time, open the member and give a new gift. It replaces the running one.",
        ],
        tips: ["Their projects stay in their browser. Downloads follow their plan again, so on Free the watermark comes back and VIP tools are left out of downloads."],
        related: ["prog-ready", "give-free-time"],
      },
      {
        id: "gift-old-codes",
        q: "What are the SCN- codes in the account window?",
        a: "The older one-year codes for one person. They still work, but gift codes in Gifts do more.",
        steps: [
          "In the studio, select *Menu*, then *Owner administration*.",
          "Under *Gift membership*, choose *Gift SceneFlow for one year* or *Gift SceneForge for one year*, and how long they have to claim it, for example *Claim within 30 days*.",
          "Select *Generate gift code*. Copy it straight away with *Copy gift code* or *Copy gift registration link*: it is only shown once.",
          "Unused codes are listed under *Access codes*. Select *Revoke unused code* to cancel one.",
        ],
        tips: ["For anything else, use *Gifts*: you choose the length and how many people, and you see the results."],
        related: ["gift-make"],
      },
    ],
  },
  {
    id: "plans",
    title: "Plans (ready-made series)",
    short: "Plans",
    intro: "Each plan is a short series of ready-written emails for one group of members. Using a plan creates the templates and campaigns for you.",
    entries: [
      {
        id: "plans-what",
        q: "What is a plan, and what happens when I use one?",
        a: "A plan is a ready-written series. Using it creates one template and one campaign per email. Nothing goes out until the campaigns are sent.",
        steps: [
          "Open *Plans*. Each card shows *Who:* gets it, *Emails:* how many, and *When:* to use it.",
          "Select *Preview emails* to read every email in the series.",
          "Select *Use this plan*. Scenering adds a template for each email to *Templates* and a campaign for each email to *Campaigns*.",
          "The campaigns go out on their scheduled days, or when you send them.",
        ],
        related: ["plans-use", "plans-which"],
      },
      {
        id: "plans-use",
        q: "How do I use a plan?",
        a: "Preview it, choose how it goes out, and create the campaigns.",
        steps: [
          "Open *Plans* and choose the plan that fits.",
          "Select *Preview emails* and read them. They show your name where the member's first name will go.",
          "Select *Use this plan*.",
          "Under *How should it go out?*, choose *Schedule the series* (each email goes out by itself on its day) or *I'll send each one myself* (the campaigns wait in *Campaigns* for you).",
          "If you schedule it, set *First email goes out*. It uses your own time zone, and the later emails follow on their days.",
          "Select *Create and schedule* or *Create the campaigns*.",
          "Select *Open Campaigns*. Open each campaign to send yourself a test, change it or cancel it.",
        ],
        tips: [
          "Who gets each email is worked out when it is sent, so people who join in between are included.",
          "If nobody is in the group yet, you can still set the plan up.",
        ],
        related: ["camp-test", "plans-edit-emails"],
      },
      {
        id: "plans-which",
        q: "Which plan should I use?",
        a: "Start with the plans that get people making videos, then the ones that thank and upgrade.",
        steps: [
          "Open *Plans*.",
          "Read the goal and *When:* on each card, or the list below.",
          "Start with *Welcome new members* and *Finish a first video*: they get people using Scenering.",
        ],
        pointsTitle: "The plans",
        points: planPoints,
        tips: ["If the *Welcome programme* is switched on in *Programmes*, do not also send the *Welcome new members* plan. New members would be welcomed twice."],
      },
      {
        id: "plans-gift",
        q: "How do I use the Free month gift plan?",
        a: "It works like any plan, but first asks which gift code the emails should carry.",
        steps: [
          "Open *Plans* and find *Free month gift*.",
          "Select *Preview emails*, then *Use this plan*.",
          "Under *The gift*, choose *Make a new code* and pick the *Plan* and *Free for*, or choose *Use one of my codes* and pick it under *Gift code*.",
          "Choose how it should go out, then select *Create and schedule* or *Create the campaigns*.",
          "The emails carry the code, the link that adds it and the last day to use it.",
          "Follow the results in *Gifts*.",
        ],
        tips: ["Codes for new members only are not offered: the people getting these emails already have accounts."],
        related: ["gift-results"],
      },
      {
        id: "plans-edit-emails",
        q: "Can I change the wording of a plan's emails?",
        a: "Yes. Once you use a plan, its emails are normal templates you can edit.",
        steps: [
          "Use the plan first, so its templates exist.",
          "Open *Templates*. Each email is named Plan:, the plan's name and its number, for example Plan: Welcome new members (1 of 3).",
          "Select *Edit*, change the text and select *Save changes*.",
          "Campaigns that have not gone out yet send the new wording.",
        ],
        tips: ["Keep `{{first_name}}` and the links as they are. They are filled in for each member."],
        related: ["tpl-edit"],
      },
      {
        id: "plans-replies",
        q: "Why do the plans invite members to reply?",
        a: "Replies tell you what members need. They only reach you if replies are switched on.",
        steps: [
          "Open *Inbox*, then *Email settings*.",
          "Switch on *Replies to automatic Scenering emails go to* your address.",
          "Think about choosing your personal address under *Campaign emails come from*, so the emails come from you.",
          "Select *Save settings*.",
        ],
        related: ["reply-to-automatic", "campaign-sender"],
      },
    ],
  },
  {
    id: "programmes",
    title: "Programmes (automatic emails)",
    short: "Programmes",
    intro: "Emails that go out by themselves, to each member at the right moment for them. Each member gets each email once.",
    entries: [
      {
        id: "prog-what",
        q: "What is a programme, and how is it different from a campaign?",
        a: "A campaign goes to a whole group once. A programme sends each member their own emails on their own days.",
        steps: [
          "Open *Programmes*.",
          "Read the ready-made programmes at the top.",
          "Set one up, check its emails, then switch it on.",
        ],
        tips: [
          "Nothing is sent until you switch a programme on, and then only to members whose moment comes after that.",
          "Only members who agreed to marketing email get programme emails, with the same unsubscribe link and business details as campaigns.",
        ],
        related: ["prog-ready", "prog-own"],
      },
      {
        id: "prog-ready",
        q: "How do I set up a ready-made programme?",
        a: "Set it up, check its emails, then switch it on.",
        steps: [
          "Open *Programmes*.",
          "Find the programme you want in the list at the top.",
          "Select *Preview emails* to read its emails.",
          "Select *Set it up*. Its emails are added to *Templates*, and the programme appears under *Your programmes*, switched off.",
          "Change the wording in *Templates* if you want to.",
          "Select *Switch on* and confirm.",
        ],
        pointsTitle: "The ready-made programmes",
        points: programmePoints,
        tips: [
          "If you set one up before, its button says *Already set up*.",
          "Do not switch on the *Welcome programme* and also send the *Welcome new members* plan. New members would be welcomed twice.",
        ],
        related: ["prog-switch"],
      },
      {
        id: "prog-own",
        q: "How do I make my own programme?",
        a: "Write the emails as templates first, then put them in order with their days.",
        steps: [
          "Write the emails in *Templates* first.",
          "Open *Programmes* and select *New programme*.",
          "Type a *Name*.",
          "Under *Starts*, choose *When someone joins* or *Before a gift ends*.",
          "Under *Stops for a member*, choose *Never: every email goes out*, *When they make a video* or *When they start paying*.",
          "Under *Emails*, pick a template for Email 1 (*Choose a template*) and its day: *Days after joining* (0 is the day they join) or *Days before the gift ends*.",
          "Select *Add an email* for each next email. Use *Remove* to take one out.",
          "Select *Save*. The programme is saved switched off.",
          "Select *Switch on* and confirm.",
        ],
        tips: [`Up to ${F.programmeEmails} emails. Days go up to ${F.joinedMaxDay} after joining, or ${F.giftMaxDay} before a gift ends.`],
        related: ["tpl-new", "prog-switch"],
      },
      {
        id: "prog-switch",
        q: "What happens when I switch a programme on or off?",
        a: "Switching on starts it for members whose moment comes from then on. Switching off stops it and drops the emails that were waiting.",
        steps: [
          "Open *Programmes*.",
          "Select *Switch on* or *Switch off* on the programme.",
          "Read the question carefully, then confirm.",
        ],
        pointsTitle: "What happens",
        points: [
          "Switching on: from now on, every member who joins (or whose gift is about to end) gets the emails on their days. Members whose moment came before now are not included.",
          "A new member is added once they confirm their email address. Day 0 is the day they are added.",
          "Switching off: no more emails go out, and the ones waiting are dropped.",
          "Switching on again starts with the members whose moment comes after that.",
        ],
      },
      {
        id: "prog-change",
        q: "How do I change a programme?",
        a: "Use Change. New wording applies to everything not yet sent.",
        steps: [
          "Open *Programmes* and select *Change* on the programme.",
          "Change the name, the emails or their days.",
          "Select *Save*.",
        ],
        tips: [
          "Changes to the emails apply to everything not yet sent. New days apply to members added from then on.",
          "To change when a programme *Starts*, switch it off first.",
          "To change the words of an email, edit its template in *Templates*.",
        ],
      },
      {
        id: "prog-activity",
        q: "How do I see what a programme has sent?",
        a: "Each programme shows its numbers, and What happened lists its latest emails.",
        steps: [
          "Open *Programmes*. Each programme shows *members added*, *emails sent*, *waiting* and *not sent*.",
          "Select *What happened* to see its latest 50 emails, newest first.",
          "Each line shows the member, which email, and its status, with the reason when it was not sent.",
        ],
        pointsTitle: "The statuses",
        points: [
          "*Waiting*: due on the date shown.",
          "*Sending*: going out now.",
          "*Sent*: sent, with the time.",
          "*Not sent*: skipped on purpose. The reason is shown.",
          "*Could not be sent*: the email provider refused it. The reason is shown.",
        ],
        related: ["prog-not-sent"],
      },
      {
        id: "prog-not-sent",
        q: "Why was a programme email not sent?",
        a: "Every email is checked again just before it goes out. The reason is shown in What happened.",
        steps: [
          "Open *Programmes* and select *What happened* on the programme.",
          "Read the reason next to the email.",
          "Find it in the list below.",
        ],
        pointsTitle: "Reasons",
        points: PROGRAMME_REASONS.map((entry) => `\"${entry.reason}\": ${entry.meaning}`),
      },
      {
        id: "prog-speed",
        q: "How quickly do programme emails go out?",
        a: `Scenering checks every five minutes and sends up to ${F.programmePerRun} programme emails each time.`,
        steps: [
          "Each email goes out within minutes of its time (for example two days after the member was added), unless many are due at once.",
          "Keep an eye on *What happened* when you first switch a programme on.",
          "Programme emails count towards the same daily sending limit as everything else.",
        ],
        related: ["daily-limit"],
      },
      {
        id: "prog-delete",
        q: "How do I delete a programme?",
        a: "Switch it off, then delete it. Its history goes; its templates stay.",
        steps: [
          "Open *Programmes*.",
          "If it is on, select *Switch off* and confirm.",
          "Select *Delete* and confirm.",
          "Its templates stay in *Templates*. Archive them there if you no longer need them.",
        ],
      },
    ],
  },
  {
    id: "templates",
    title: "Templates",
    short: "Templates",
    intro: "A template is one email: its subject, preview line, picture and text. Campaigns and programmes send templates.",
    entries: [
      {
        id: "tpl-new",
        q: "How do I make a new template?",
        a: "Start from a ready-made starter, change it, preview it and save it.",
        steps: [
          "Open *Templates* and select *New template*.",
          "Pick a starting point under *Start from a professional template*. You can change everything afterwards.",
          "Fill in *Name* (only you see it), *Category* and *Internal description* (notes for you).",
          "Write the *Subject* and the *Preheader*: the short line most inboxes show after the subject.",
          "If you want a picture across the top, paste its address in *Hero image URL (optional)*.",
          "Write the *HTML body*. The Scenering logo, colours, footer and unsubscribe link are added for you.",
          "Leave *Plain-text body (optional)* empty unless you want to write it yourself. It is made from the HTML body.",
          "Select *Preview rendered email* and check it.",
          "Select *Create template*.",
        ],
        related: ["tpl-variables", "tpl-links", "tpl-preview"],
      },
      {
        id: "tpl-variables",
        q: "How do I put the member's name in an email?",
        a: "Use a template variable. It is filled in for each person when the email is sent.",
        steps: [
          "In the template, click in the *Subject* or the *HTML body* where the name should go.",
          "Under *Template variables*, select `{{first_name}}`. It goes in where you clicked.",
          "Select *Preview rendered email* to check.",
        ],
        pointsTitle: "The variables",
        points: EMAIL_TEMPLATE_VARIABLES.map((variable) => `\`${variable.key}\`: ${variable.description}`),
        tips: ["Only these variables work. Anything else in double curly brackets is sent exactly as typed."],
      },
      {
        id: "tpl-links",
        q: "How do I add a link or a button?",
        a: "Write a normal link in the HTML body. Add class=\"cta\" to make it a big button.",
        steps: [
          "In *HTML body*, write a link like `<a href=\"https://scenering.com/app\">Open Scenering</a>`.",
          "For a big button, write `<a class=\"cta\" href=\"https://scenering.com/app\">Open the studio</a>`.",
          "Use full addresses that start with https://.",
          "Select *Preview rendered email* and check each link.",
        ],
        tips: ["Scripts and unsafe links are removed when the email is made, so a link that disappears in the preview was not allowed."],
      },
      {
        id: "tpl-preview",
        q: "How do I preview a template?",
        a: "Preview shows the email the way a member will see it.",
        steps: [
          "Open *Templates* and select *Preview* on the template.",
          "Type a *Sample display name* and *Sample email* to see it filled in for that person.",
          "Switch between *HTML* and *Plain text*, and between *Desktop* and *Mobile*.",
          "Check *Subject as it will be sent:*.",
        ],
        tips: ["To see it in a real mailbox, send yourself a test from a campaign."],
        related: ["camp-test"],
      },
      {
        id: "tpl-edit",
        q: "How do I change a template?",
        a: "Edit it and save. Emails that have not gone out yet use the new version.",
        steps: [
          "Open *Templates* and select *Edit* on the template.",
          "Make the changes.",
          "Select *Preview rendered email* to check them.",
          "Select *Save changes*.",
        ],
        tips: [
          "Campaigns read the template as each batch goes out. Do not change a template while its campaign is sending, or later batches get the new version.",
          "Programmes that use the template send the new version from then on.",
        ],
      },
      {
        id: "tpl-copy-archive-delete",
        q: "How do I copy, archive or delete a template?",
        a: "Duplicate makes a copy, Archive puts it away, and Delete removes a template no campaign has used.",
        steps: [
          "Open *Templates*.",
          "Select *Duplicate* to make a copy you can change without touching the original.",
          "Select *Archive* to put away a template you no longer use. Tick *Show archived* to see it again, and select *Restore* to bring it back.",
          "Select *Delete* to remove a template for good, then *Delete template* to confirm. Select *Keep template* if you change your mind.",
        ],
        tips: ["A template a campaign has used cannot be deleted, only archived, so campaign history stays readable."],
      },
    ],
  },
  {
    id: "campaigns",
    title: "Campaigns",
    short: "Campaigns",
    intro: "A campaign sends one template to a group of members, now or at a time you choose.",
    entries: [
      {
        id: "camp-new",
        q: "How do I create a campaign?",
        a: "Choose a template and an audience, then save it as a draft or schedule it.",
        steps: [
          "Make sure the email exists in *Templates*.",
          "Open *Campaigns* and select *New campaign*.",
          "Type a *Campaign name* (only you see it), for example October newsletter.",
          "Choose the *Template*.",
          "If you want a different subject from the template's, type it in *Subject override (optional)*.",
          "Choose the *Audience* and check *Estimated recipients*.",
          "To send it later, tick *Schedule this campaign for later*, set *Send at* and select *Schedule campaign*. Otherwise select *Save as draft*.",
          "The campaign opens. Preview it and send yourself a test before it goes out.",
        ],
        related: ["camp-audience", "camp-test", "camp-send"],
      },
      {
        id: "camp-audience",
        q: "Which audience should I choose?",
        a: "Choose the group the email is written for. Every audience only includes members who agreed to marketing email.",
        steps: [
          "In *New campaign*, open *Audience*.",
          "Choose a group. Some groups ask for more, such as dates or a number of days.",
          "Check *Estimated recipients* before you save.",
        ],
        pointsTitle: "The audiences",
        points: AUDIENCE_TYPES.map((type) => `*${type.label}*: ${type.hint}${AUDIENCE_NOTES[type.value] ? ` ${AUDIENCE_NOTES[type.value]}` : ""}`),
        tips: [
          "People who unsubscribed, never agreed, have deleted accounts or have addresses that do not work are always left out.",
          `A campaign can go to up to ${n(F.largestAudience)} people.`,
        ],
        related: ["camp-who-gets"],
      },
      {
        id: "camp-test",
        q: "How do I check a campaign before sending it?",
        a: "Preview it, then send a test to your own address and read it in your mailbox.",
        steps: [
          "Open *Campaigns* and select the campaign.",
          "Select *Preview this campaign*. Check the subject, the text and the links, on desktop and mobile.",
          "Under *Send a test email*, type your own address and select *Send test email*.",
          "Open the test in your mailbox. Check the subject, the name, every link and the footer with your business details.",
          "Fix anything in *Templates*, then send another test.",
        ],
        tips: ["Tests are clearly marked as tests and are not counted as campaign emails."],
      },
      {
        id: "camp-send",
        q: "How do I send a campaign now?",
        a: "Open it, select Review and send, check the summary and confirm.",
        steps: [
          "Open the campaign in *Campaigns*.",
          "Select *Review and send*.",
          "Read every line in *Send this campaign*: template, subject, audience and number of people.",
          "Select *Send campaign to eligible recipients*.",
          "Watch the progress bar. You can close the page: the rest goes out by itself.",
        ],
        tips: [
          `It goes out in batches of ${F.campaignBatch}. With the page open it goes faster; with the page closed, up to ${F.campaignPerRun} go out every five minutes.`,
          "Once a batch has gone to the email provider, those emails cannot be called back.",
          "On Resend's free plan, check the daily limit before a big send.",
        ],
        related: ["daily-limit", "camp-results"],
      },
      {
        id: "camp-schedule",
        q: "How do I schedule a campaign for later?",
        a: "Schedule it when you create it. It goes out within five minutes of its time, even if nobody is signed in.",
        steps: [
          "Open *Campaigns* and select *New campaign*.",
          "Fill in the campaign as usual.",
          "Tick *Schedule this campaign for later* and set *Send at*.",
          "Select *Schedule campaign*.",
          "Before it goes out, open it and send yourself a test.",
        ],
        tips: ["To stop it before its time, open it and select *Cancel campaign*."],
      },
      {
        id: "camp-cancel",
        q: "How do I stop a campaign?",
        a: "Cancel it. People already emailed stay emailed; nobody else is emailed.",
        steps: [
          "Open the campaign in *Campaigns*.",
          "Select *Cancel campaign* (for a draft or a scheduled campaign) or *Cancel remaining sends* (while it is sending).",
          "Read the message: the queued emails will not go out.",
        ],
      },
      {
        id: "camp-statuses",
        q: "What do the campaign statuses mean?",
        a: "The status next to the campaign's name says where it is.",
        steps: [
          "Open *Campaigns*. The status is shown on each campaign.",
          "Find it in the list below.",
        ],
        pointsTitle: "The statuses",
        points: Object.entries(CAMPAIGN_STATUS_TEXT).map(([status, meaning]) => `${status.charAt(0).toUpperCase()}${status.slice(1).replace(/_/g, " ")}: ${meaning}`),
      },
      {
        id: "camp-results",
        q: "How do I read a campaign's results?",
        a: "Open the campaign. The boxes count what happened to its emails.",
        steps: [
          "Open the campaign in *Campaigns*.",
          "Read the boxes: *Recipients*, *Sent*, *Delivered*, *Failed*, *Unsubscribed* and *Queued*.",
          "Read *Recent failures* for the addresses that failed, with the reason.",
          "Select *All campaigns* to go back to the list.",
        ],
        pointsTitle: "What the boxes mean",
        points: [
          "*Recipients*: the people it was going to, worked out when sending started.",
          "*Sent*: handed to the email provider.",
          "*Delivered*: the provider confirmed it reached the mailbox. This needs the Resend events link.",
          "*Failed*: bounced or refused.",
          "*Unsubscribed*: people who unsubscribed through this campaign's link, or marked it as spam.",
          "*Queued*: still waiting to go out.",
        ],
        tips: ["Scenering does not track opens or clicks. To see what works, watch the results in *Gifts* and how many members make videos in *Members*."],
        related: ["resend-events"],
      },
      {
        id: "camp-who-gets",
        q: "Who never gets campaign emails?",
        a: "Anyone who has not agreed to marketing email. Scenering checks this every time.",
        steps: [
          "Nothing to do: Scenering leaves these people out of every campaign, plan and programme.",
          "To see how many people you can reach, open *Dashboard* and look at *Marketing consent*.",
        ],
        pointsTitle: "Always left out",
        points: [
          "Members who did not agree to marketing email.",
          "Members who unsubscribed, or marked an email as spam.",
          "Deleted accounts and addresses that are not valid.",
        ],
        related: ["law-who"],
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    short: "Dashboard",
    intro: "The numbers for your members and your emails.",
    entries: [
      {
        id: "dash-numbers",
        q: "What do the Dashboard numbers mean?",
        a: "The top cards count members and templates; the next ones count what happened to campaign emails.",
        steps: [
          "Open *Dashboard*.",
          "Read the cards under *Audience and content statistics* and *Delivery statistics*.",
          "Look at *Recent campaigns* and *Campaign statuses*. Select a campaign to open it.",
        ],
        pointsTitle: "The cards",
        points: [
          "*Total users*: every account.",
          "*Marketing consent*: people who agreed to marketing email. These are the people campaigns can reach.",
          "*Unsubscribed / no consent*: people who never agreed or unsubscribed. They are always left out.",
          "*Templates* and *Campaigns*: how many you have.",
          "*Sent*: campaign emails handed to the email provider.",
          "*Delivered*: emails the provider confirmed reached the mailbox.",
          "*Pending*: emails waiting in the send queue.",
          "*Failed* and *Bounced*: emails that did not arrive.",
          "*Unsubscribed*: people who unsubscribed through a campaign link.",
        ],
        related: ["dash-bounces"],
      },
      {
        id: "dash-bounces",
        q: "What should I do about failed and bounced emails?",
        a: "A few are normal. Many at once mean something to fix.",
        steps: [
          "Open *Dashboard* and look at *Failed* and *Bounced*.",
          "Open the campaign and read *Recent failures* for each address and its reason.",
          "If many failed at the same time, check the warning on *Dashboard* and today's sending limit.",
          "If one member's address keeps bouncing, write to them another way, or leave it.",
        ],
        tips: ["Email providers may pause your sending if many emails bounce. Never send to addresses from outside Scenering."],
        related: ["daily-limit"],
      },
    ],
  },
  {
    id: "customers",
    title: "Customers: plans, downloads and billing",
    short: "Customers and billing",
    intro: "What customers get, how payments work, and how to help with common requests.",
    entries: [
      {
        id: "plan-limits",
        q: "What does each plan include?",
        a: "Free lets people try Scenering, SceneFlow is for regular creators, and SceneForge has no weekly download limit.",
        steps: [
          "Read the list below.",
          "Open the website's pricing page (`scenering.com/pricing`) to see exactly what customers see.",
          "In the studio, use the plan preview to see each plan's screens.",
        ],
        pointsTitle: "The plans",
        points: [
          `*${free.name}*: ${free.description} Downloads carry the Scenering watermark.`,
          `*${flow.name}*: ${flow.description} ${price(flow)}.`,
          `*${forge.name}*: ${forge.description} ${price(forge)}.`,
        ],
        related: ["downloads-count", "plan-preview"],
      },
      {
        id: "downloads-count",
        q: "How do downloads count, and when do they start again?",
        a: "Each finished video a customer downloads uses one download. Previews and renders are free. The week starts again every Monday.",
        steps: [
          "When a customer cannot download, open *Members*, find them, and look at their *Plan* and *Videos*.",
          `Free has ${freeDownloads}. ${flow.name} has ${flowDownloads}. ${forge.name} has no weekly limit.`,
          "Tell them the count starts again on Monday at 02:00 South African time (midnight UTC).",
          "If it suits, offer them a plan, or give them free time.",
        ],
        related: ["give-free-time"],
      },
      {
        id: "plan-preview",
        q: "How do I see the studio the way a customer on each plan sees it?",
        a: "Use the plan preview in Owner administration. Your own access does not change.",
        steps: [
          "Open the studio.",
          "Select *Menu*, then *Owner administration*.",
          "Under *Preview the Studio as a customer plan*, select Free, SceneFlow or SceneForge.",
          "The studio shows that plan's badges and upgrade prompts, and the menu shows the word preview after the plan.",
          "Select SceneForge to go back to your normal view. Closing the browser tab ends the preview too.",
        ],
      },
      {
        id: "subscriptions",
        q: "How do paid subscriptions work?",
        a: "FastSpring takes the payments and is the seller of record, so it also charges and pays the sales tax. Scenering changes the member's plan as soon as FastSpring confirms a subscription.",
        steps: [
          "To see a member's subscription, open *Members* and select them. *Plan* shows whether they pay monthly or yearly, and when it renews.",
          "A subscription renews by itself until it is cancelled.",
          "After cancelling, the plan carries on to the end of the paid period, then drops to Free.",
          "Failed payments are tried again by FastSpring."
        ],
        related: ["cancel-subscription", "payments-check"],
      },
      {
        id: "cancel-subscription",
        q: "A customer wants to cancel. What do I tell them?",
        a: "They cancel in FastSpring, through their account window. Their projects are not deleted.",
        steps: [
          "Tell them to select *Menu*, then *Account, membership & billing*.",
          "Under *Subscription*, they select *Manage or cancel*. FastSpring opens, and they cancel there.",
          "Their plan carries on until the end of the period they paid for, then becomes Free.",
          "If they cannot do it themselves, cancel the subscription in the FastSpring dashboard.",
        ],
      },
      {
        id: "payment-failed",
        q: "A customer's payment failed. What do I tell them?",
        a: "They update their card in FastSpring, through their account window.",
        steps: [
          "Tell them to select *Menu*, then *Account, membership & billing*.",
          "Under *Subscription*, they select *Update payment card* and enter the new card.",
          "FastSpring tries the payment again.",
        ],
      },
      {
        id: "refunds",
        q: "A customer asks for a refund. What do I do?",
        a: "Refunds are considered case by case, as the Terms say, and are made in FastSpring.",
        steps: [
          "Read their reason, and look at their *Plan* and *Videos* in *Members*.",
          "Decide. The Terms say refunds are considered case by case; /refunds is the public policy to quote.",
          "To refund, open the FastSpring dashboard, find their order and refund it there. Scenering cannot refund.",
          "If the subscription should stop too, cancel it in FastSpring.",
          "Answer them from the Inbox, say what you did, and mark the conversation *Resolved*.",
        ],
      },
      {
        id: "payments-check",
        q: "How do I check that payments are working?",
        a: "Owner administration shows whether the payment setup is complete and what FastSpring sent last.",
        steps: [
          "Open the studio, select *Menu*, then *Owner administration*.",
          "Scroll to *FastSpring billing*.",
          "It says *Ready to take payments*, or *Not ready — finish the items below* with each item marked *Set* or *Missing*.",
          "Check that the address under *Webhook URL to register in FastSpring:* is added in FastSpring, with the events under *Events to subscribe to:*.",
          "*Last webhooks received* lists the latest messages from FastSpring. After a purchase, one should appear within a minute.",
        ],
      },
      {
        id: "lost-project",
        q: "A customer lost a project. Can I get it back?",
        a: "No. Projects are kept in the customer's own browser, not on Scenering's server, so nobody can restore them from here.",
        steps: [
          "Explain kindly that projects live in the browser they were made in.",
          "Ask whether they cleared their browser data, used a private window, or changed browser or computer. Each of these empties the projects there.",
          "If they still have the browser and computer they used, ask them to open Scenering there.",
          "Suggest they download finished videos when they are done, and never clear site data for scenering.com.",
        ],
        tips: ["This is also written in the Privacy page, under what stays in your browser."],
      },
      {
        id: "password-reset",
        q: "A customer forgot their password. What do I do?",
        a: "They reset it themselves. Nobody can see or set a password in the admin.",
        steps: [
          "Tell them to open the sign-in page and select *Forgot password?*.",
          "They type their email address and select *Send reset link*.",
          "They open the email and choose a new password.",
          `They can ask for ${F.resetLinksPerHour} reset links an hour. If none arrives, ask them to check spam, then look at today's sending limit.`,
        ],
        related: ["cant-sign-in"],
      },
      {
        id: "delete-account",
        q: "A customer asks to delete their account or data. What do I do?",
        a: "Confirm the request, check it comes from the account's own address, then have the account deleted.",
        steps: [
          "Answer from the Inbox to say you received the request.",
          "Check that it comes from the address on the account. The member box in the conversation shows whether the sender has an account.",
          "There is no delete button in the admin yet. Ask your developer to delete the account and its records.",
          "Tell them their projects are in their own browser, and that clearing site data for scenering.com deletes them.",
          "When it is done, tell them, and mark the conversation *Resolved*.",
        ],
        tips: ["Under South African law (POPIA), people may ask to see, correct or delete their information. The Privacy page tells them to use the contact form for this."],
      },
      {
        id: "studio-help",
        q: "Where do I find how the studio works, to answer customers' questions?",
        a: "The public Manual and FAQ explain the studio to customers.",
        steps: [
          "Read the Manual at `scenering.com/manual` and the FAQ at `scenering.com/faq`.",
          "When you answer a customer, send the link to the right page.",
          "Use the plan preview to see what they see on their plan.",
        ],
        related: ["plan-preview"],
      },
      {
        id: "api-keys",
        q: "What are the API keys in the menu?",
        a: "Optional personal keys for Pexels, Pixabay and Speechify, kept in this browser only.",
        steps: [
          "Select *Menu*, then *API keys*.",
          "Add keys only if you want to use your own accounts on this computer.",
          "Wherever your keys are missing, the server's own keys are used.",
        ],
        tips: ["Keys stay in the browser where they were added. Add them again on another computer or browser."],
      },
      {
        id: "social-links",
        q: "How do I change the social media links on the website?",
        a: "In Owner administration. The change shows for every visitor straight away.",
        steps: [
          "Open the studio, select *Menu*, then *Owner administration*.",
          "Scroll to *Social media*.",
          "Paste the full https:// address of each profile. Leave a field empty to hide that icon.",
          "Select *Save social links*.",
        ],
      },
      {
        id: "store-notice",
        q: "How do I change or hide the store notice on the front pages?",
        a: "In Owner administration or on Dashboard in the Email Centre. The change shows on the website straight away.",
        steps: [
          "Open the studio, select *Menu*, then *Owner administration*, or open *Dashboard* in the Email Centre.",
          "Find *Store notice*.",
          "Tick or untick *Show store notice on front pages*, or edit the *Notice badge* and *Notice message*.",
          "Select *Save store notice*.",
        ],
      },
      {
        id: "old-grant",
        q: "What are Grant complimentary membership and the accounts table in Owner administration?",
        a: "The older way of giving free time. They do the same as Give free time in Members, which offers more.",
        steps: [
          "Select *Menu*, then *Owner administration*.",
          "*Grant complimentary membership*: type the customer's account email, choose SceneFlow or SceneForge and *1 month* or *1 year*, and select *Grant access*.",
          "The table *Accounts, email consent and complimentary access* has quick buttons such as *Flow · 1 month*, and *Revoke* to end a gift.",
          "For more lengths and everything about the member, use *Members* instead.",
        ],
        related: ["give-free-time"],
      },
    ],
  },
  {
    id: "payments",
    title: "Taking payments (FastSpring)",
    short: "Taking payments",
    intro: "How Scenering takes card payments through FastSpring, and the exact settings to enter in the FastSpring app.",
    entries: [
      {
        id: "fastspring-what",
        q: "What is FastSpring, and how does it take payments?",
        a: "FastSpring is the seller of record for the paid plans. It takes the card, charges and pays the sales tax, and handles failed payments and refunds. Scenering opens the checkout and believes FastSpring's signed messages about subscriptions.",
        steps: [
          "The paid plans are sold through FastSpring: SceneFlow monthly and yearly, and SceneForge monthly and yearly.",
          "The customer pays FastSpring. Scenering never sees a card number and keeps no payment details.",
          "When FastSpring confirms a subscription, Scenering changes the member's plan straight away.",
          "Popup checkout opens directly on the pricing page or in the account window, or redirects to a FastSpring checkout session when API credentials are set.",
        ],
        tips: ["Card and payment questions go to FastSpring's support, because the money is theirs. Scenering's contact form handles everything else."],
        related: ["fastspring-setup", "subscriptions"],
      },
      {
        id: "fastspring-setup",
        q: "How do I set FastSpring up from the beginning?",
        a: "Work through the FastSpring app once: the storefront, four products, one webhook and optionally the API keys. The FastSpring billing panel then shows anything still missing.",
        steps: [
          "In the FastSpring app, open Checkouts, then Popup Checkouts, and click Create Popup Checkout. In the Company Sub-Directory Checkout ID field, enter `popup-scenering` (no spaces or special characters): that ID becomes the part after the slash in the checkout URL.",
          "Copy the `data-storefront` value into `FASTSPRING_STOREFRONT`, for example `scenering.onfastspring.com/popup-scenering`. Keep the test spelling, for example `scenering.test.onfastspring.com/popup-scenering`, until you go live.",
          "On the same popup checkout, whitelist `https://scenering.com` as an allowed website.",
          "Open Store, then Products, and create the four subscription products with these exact paths: `sceneflow-monthly` ($19 a month), `sceneflow-yearly` ($180 a year), `sceneforge-monthly` ($39 a month) and `sceneforge-yearly` ($372 a year).",
          "Leave `FASTSPRING_SCENEFLOW_MONTHLY_PATH`, `FASTSPRING_SCENEFLOW_YEARLY_PATH`, `FASTSPRING_SCENEFORGE_MONTHLY_PATH` and `FASTSPRING_SCENEFORGE_YEARLY_PATH` unset while the product paths match those names. Set one only when a product was made with a different path.",
          "Open Developer Tools, then Webhooks, and add a webhook pointing at `https://scenering.com/api/webhooks/fastspring`.",
          "Tick the six subscription events listed under *Events to subscribe to:* in the *FastSpring billing* panel.",
          "Give the webhook an HMAC SHA256 Secret, and put that secret in `FASTSPRING_WEBHOOK_SECRET`.",
          "Optionally create API credentials under Developer Tools, then API, and put them in `FASTSPRING_API_USERNAME` and `FASTSPRING_API_PASSWORD`. They open server-made checkouts and signed-in account links.",
          "Open the studio, select *Menu*, then *Owner administration*, and read the *FastSpring billing* panel until it says *Ready to take payments*.",
        ],
        pointsTitle: "What each value is for",
        points: [
          "`FASTSPRING_STOREFRONT` is the popup checkout address. Its host says which environment is live: a host with `.test.` in it is FastSpring's test store.",
          "`FASTSPRING_WEBHOOK_SECRET` is what proves a message really came from FastSpring. Without it the webhook answers 503 and trusts nobody.",
          "The four product paths are how a payment is matched to a plan. A path the settings do not name is recorded and grants nothing.",
          "`FASTSPRING_API_USERNAME` and `FASTSPRING_API_PASSWORD` are optional. Popup checkout works without them.",
        ],
        related: ["fastspring-products", "fastspring-webhook", "fastspring-live"],
      },
      {
        id: "fastspring-products",
        q: "Which products does FastSpring sell, and what are their paths?",
        a: "Four subscription products, one per plan and billing period. The path of each product is what the website matches a payment against.",
        steps: [
          "SceneFlow monthly is `sceneflow-monthly`, at $19 a month.",
          "SceneFlow yearly is `sceneflow-yearly`, at $180 a year.",
          "SceneForge monthly is `sceneforge-monthly`, at $39 a month.",
          "SceneForge yearly is `sceneforge-yearly`, at $372 a year.",
          "In the FastSpring app, open Store, then Products, to see them. The path is the product's ID field.",
          "If a product was made with a different path, set the matching product path value, such as `FASTSPRING_SCENEFLOW_MONTHLY_PATH`, and the payment mapping follows it.",
        ],
        tips: ["The prices live in FastSpring and in the plan settings in the code. Keep the two the same, or customers will see one price and pay another."],
        related: ["fastspring-setup", "plan-limits"],
      },
      {
        id: "fastspring-webhook",
        q: "How does the website know a payment worked?",
        a: "FastSpring sends a signed message to the webhook, and the website changes the member's plan when the message proves a subscription changed.",
        steps: [
          "The webhook address is `https://scenering.com/api/webhooks/fastspring`, registered in the FastSpring app under Developer Tools, then Webhooks.",
          "Every message is signed with the webhook's HMAC SHA256 Secret. The website checks the signature before it reads anything else.",
          "Each message is recorded once, so a redelivery cannot grant anything twice.",
          "The signed message carries the tags the checkout set: the Scenering account id and the email address. That is how the payment finds the right member.",
          "*Last webhooks received* in the *FastSpring billing* panel shows every message and what the website did with it.",
        ],
        pointsTitle: "The six events",
        points: [
          "`subscription.activated`: a new subscription or trial has started.",
          "`subscription.updated`: the subscription changed.",
          "`subscription.charge.completed`: a renewal payment worked.",
          "`subscription.charge.failed`: a renewal payment failed. Access continues while FastSpring retries the card.",
          "`subscription.canceled`: the subscription will not renew. Access continues until the paid period ends.",
          "`subscription.deactivated`: the paid period is over, and the member goes back to Free.",
        ],
        related: ["fastspring-setup", "payments-fastspring-check"],
      },
      {
        id: "fastspring-test",
        q: "How do I test a FastSpring payment without real money?",
        a: "Use FastSpring's test store. It is a separate world: its own storefront, its own webhook and its own secret.",
        steps: [
          "Keep the test storefront path in `FASTSPRING_STOREFRONT`, with `.test.` in the host.",
          "Register the webhook on the test store and put that webhook's secret in `FASTSPRING_WEBHOOK_SECRET`.",
          "Buy a subscription in the test checkout with FastSpring's test card details, from their test orders page.",
          "Sign in to the website with the same email you used at the test checkout, and watch the plan change.",
          "Read *Last webhooks received* to see each test message and its outcome.",
          "Revoke the test membership in *Members* afterwards, so the test account does not keep a paid plan.",
        ],
        related: ["fastspring-live"],
      },
      {
        id: "fastspring-live",
        q: "How do I switch FastSpring from test to live?",
        a: "Change four things together: the storefront, the webhook, its secret and, if you use them, the API keys. Then finish FastSpring's own seller checks.",
        steps: [
          "In the FastSpring app, move to the live store and copy its storefront path into `FASTSPRING_STOREFRONT`, without `.test.` in the host.",
          "Register the webhook again on the live store, at `https://scenering.com/api/webhooks/fastspring`, and tick the same six events.",
          "Put the live webhook's secret in `FASTSPRING_WEBHOOK_SECRET`.",
          "Replace `FASTSPRING_API_USERNAME` and `FASTSPRING_API_PASSWORD` with the live API credentials, if you use them.",
          "Finish FastSpring's seller onboarding: business details, tax and bank. FastSpring pays out only after this.",
          "Buy the cheapest plan yourself with a real card, confirm the plan changes, then refund the payment in FastSpring if you wish.",
        ],
        tips: ["A production site still pointed at the test storefront cannot take a real payment. The FastSpring billing panel warns about this by name."],
        related: ["fastspring-setup", "fastspring-test"],
      },
      {
        id: "fastspring-account",
        q: "How does a customer manage or cancel their FastSpring subscription?",
        a: "In FastSpring's own account pages. The account window in the app leads there, and FastSpring emails the customer a secure sign-in link.",
        steps: [
          "Tell them to select *Menu*, then *Account, membership & billing*.",
          "Under *Subscription*, *Manage or cancel* opens FastSpring's account pages on the subscriptions tab.",
          "There, the Manage menu offers update payment method, cancel subscription and the renewal invoices.",
          "*Update payment card* opens the same place, for changing the card on file.",
          "*Customer portal* opens FastSpring's account pages signed in, when the API keys are set.",
          "A cancelled subscription keeps working until the paid period ends. The member can undo the cancellation there until then.",
        ],
        tips: ["To cancel for a customer, open FastSpring's dashboard, find the subscription and cancel it there. Scenering cannot cancel or refund a payment."],
        related: ["cancel-subscription", "payment-failed", "refunds"],
      },
      {
        id: "payments-fastspring-check",
        q: "How do I check that FastSpring payments are working?",
        a: "Owner administration shows whether the FastSpring setup is complete and what FastSpring sent last.",
        steps: [
          "Open the studio, select *Menu*, then *Owner administration*.",
          "Scroll to *FastSpring billing*.",
          "It says *Ready to take payments*, or *Not ready — finish the items below* with each item marked *Set* or *Missing*.",
          "Check that the webhook address shown is added in the FastSpring app, with the events listed beside it.",
          "*Last webhooks received* lists the latest messages from FastSpring. After a purchase, one should appear within a minute.",
        ],
        related: ["payments-check", "fastspring-webhook"],
      },
      {
        id: "fastspring-no-access",
        q: "A customer paid through FastSpring but has no access. What do I check?",
        a: "Almost always the payment found no matching account, or the product path is not one the settings name. The webhook log says which.",
        steps: [
          "Open the studio, select *Menu*, then *Owner administration*, and read *Last webhooks received*.",
          "Find their message. The status `unmatched` means the tags carried no account this website knows: check whether they paid with a different email address than they signed up with.",
          "The status `unknown_price` means the product path is not one of the four the settings name. Compare it with the product paths shown in the *FastSpring billing* panel.",
          "If no message arrived at all, open the FastSpring app and check the webhook's delivery log for the address `https://scenering.com/api/webhooks/fastspring`.",
          "Once the cause is fixed, a redelivery from FastSpring's log grants the plan, or you can give free time in *Members* while FastSpring sorts the payment out.",
        ],
        related: ["payments-fastspring-check", "give-free-time"],
      },
    ],
  },
  {
    id: "sending",
    title: "Sending limits and costs",
    short: "Sending limits",
    intro: "How many emails Scenering can send, what counts, and the technical setup that records what happened to them.",
    entries: [
      {
        id: "daily-limit",
        q: "How many emails can Scenering send a day?",
        a: `It depends on your Resend plan. The free plan allows ${F.resendFreePerDay} emails a day and ${n(F.resendFreePerMonth)} a month.`,
        steps: [
          "Before a big campaign, look at *Estimated recipients* in the campaign, or *Marketing consent* on *Dashboard*.",
          `On the free plan, keep a day's campaigns well under ${F.resendFreePerDay}, so account emails such as confirmations still go out.`,
          "Spread a big audience over several days, for example with *Registered within a date range*.",
          `When you often need more, upgrade in the Resend dashboard. Pro is $${F.resendProDollars} a month for ${n(F.resendProPerMonth)} emails.`,
        ],
        pointsTitle: "What counts",
        points: [
          "Campaign emails, programme emails and tests.",
          "Your replies and new messages from the Inbox.",
          "Account emails: confirmations, password resets, alerts and copies to you.",
          "When the day's limit is used up, the rest fail until the next day, including confirmation emails for new members.",
        ],
        tips: [
          "Receiving email through Cloudflare costs nothing and has no limit.",
          "Prices change from time to time. Check resend.com/pricing.",
        ],
      },
      {
        id: "resend-events",
        q: "How do I make Delivered and Bounced show real numbers?",
        a: "Connect Resend's events to Scenering once. Then deliveries, bounces and spam complaints are recorded.",
        steps: [
          "In the Resend dashboard, add a webhook pointing at `https://scenering.com/api/webhooks/resend`.",
          "Tick the events delivered, bounced, complained and failed.",
          "Copy the webhook's signing secret.",
          "In Cloudflare, add it to the `scenering` Worker as the secret RESEND_WEBHOOK_SECRET.",
          "From then on *Delivered*, *Bounced* and complaints are counted. A spam complaint counts as an unsubscribe.",
        ],
      },
      {
        id: "dmarc",
        q: "What is DMARC, and should I add it?",
        a: "A DNS record that tells mailboxes how to check email claiming to be from scenering.com. It helps your emails reach inboxes. It is recommended.",
        steps: [
          "In the Cloudflare dashboard, open the DNS records for scenering.com.",
          "Add a TXT record with the name `_dmarc`.",
          "Give it the value `v=DMARC1; p=none; rua=mailto:vincent@scenering.com`.",
          "Save it. Reports about email using your domain then go to vincent@.",
        ],
      },
    ],
  },
  {
    id: "law",
    title: "Email rules and the law",
    short: "The law",
    intro: "The main South African rules for marketing email and how Scenering follows them. This is a summary to help you, not legal advice.",
    entries: [
      {
        id: "law-who",
        q: "Who am I allowed to send marketing emails to?",
        a: "Only people who agreed to receive them (POPIA, section 69). Scenering's campaigns, plans and programmes only ever send to members who agreed.",
        steps: [
          "Send all marketing through *Campaigns*, *Plans* or *Programmes*. They check agreement for you.",
          "Use *New message* in the Inbox only for one-to-one messages a person asked for or needs, not for marketing.",
          "Never put email addresses from outside Scenering (bought lists, business cards, other websites) into Scenering emails.",
        ],
        tips: ["Members agree with the box on the sign-up form, or later in their account window under *Optional tutorials and product news*."],
        related: ["camp-who-gets", "law-every-email"],
      },
      {
        id: "law-every-email",
        q: "What must every marketing email include?",
        a: "Who it is from, your business details, and an easy way to unsubscribe. Scenering adds the details and the unsubscribe link once you have filled in Email settings.",
        steps: [
          "Fill in your business details in *Email settings*.",
          "Send yourself a test of a campaign and check the footer.",
          "Use a clear sender name, such as Scenering or your own name.",
        ],
        points: [
          "Your business name, physical address and phone number: added to every campaign and programme email from *Email settings*.",
          "An unsubscribe link and a link to email preferences: always added to the footer.",
        ],
        related: ["business-details"],
      },
      {
        id: "law-unsubscribe",
        q: "What happens when someone unsubscribes or complains?",
        a: "Their agreement is withdrawn at once, and Scenering leaves them out of every campaign, plan and programme.",
        steps: [
          "Nothing to do: it happens by itself.",
          "Do not ask them by email to sign up again. They can switch marketing email back on themselves in their account window.",
        ],
        points: [
          "A spam complaint counts the same as unsubscribing.",
          "They still get account emails (confirmations, password resets, billing). These are not marketing.",
        ],
      },
      {
        id: "law-registry",
        q: "What is the National Consumer Commission opt-out registry?",
        a: "Consumer Protection Act regulations gazetted on 15 April 2026 created a registry where people can block direct marketing. Marketers have to register and check their lists against it every month.",
        steps: [
          "Check with the National Consumer Commission, or an adviser, whether and how Scenering must register.",
          "If you must, register and follow their process to check your list each month.",
          "Keep sending marketing only through Scenering's campaigns, plans and programmes, which leave out anyone who has not agreed.",
        ],
        tips: ["Rules change. Check the details with the National Consumer Commission or a legal adviser."],
      },
      {
        id: "law-account-emails",
        q: "What is the difference between account emails and marketing emails?",
        a: "Account emails are about the member's account and go to everyone. Marketing emails only go to members who agreed.",
        steps: [
          "Account emails: confirmations, password resets, security and billing messages. Scenering sends these by itself.",
          "Marketing emails: campaigns, plans and programmes.",
          "When you are not sure, treat an email as marketing and send it as a campaign.",
        ],
      },
    ],
  },
  {
    id: "help",
    title: "Problems and answers",
    short: "Problems",
    intro: "What to do when something does not work as expected.",
    entries: [
      {
        id: "campaign-stuck",
        q: "A campaign has been sending for a long time. What do I do?",
        a: "Check how many are left and whether batches are failing.",
        steps: [
          "Open the campaign. *Queued* shows how many emails are left.",
          "Select *Continue sending* to send the next batches straight away.",
          "Read *Recent failures*. If every email fails, check the warning on *Dashboard* and today's sending limit.",
          "To stop it, select *Cancel remaining sends*.",
        ],
        related: ["daily-limit"],
      },
      {
        id: "email-not-arriving",
        q: "A member did not get a campaign or programme email. What do I do?",
        a: "Check that they can get marketing email, then whether it was sent.",
        steps: [
          "Open *Members* and find them. If it says *No marketing email*, they are left out on purpose.",
          "Open them and look at *Campaign emails*. For a programme, select *What happened* on the programme.",
          "If it was sent, ask them to look in spam and promotions folders, and to add the sender to their contacts.",
          "If it failed, the reason is shown. Check today's sending limit.",
        ],
        related: ["no-marketing-email", "prog-not-sent"],
      },
      {
        id: "inbox-reply-failed",
        q: "My reply could not be sent. What do I do?",
        a: "The message under the reply box says why. Your text stays in the box.",
        steps: [
          "Read the message under the reply box.",
          "Select *Connect address* and check that sending replies is set up.",
          "Check today's sending limit.",
          "Send it again once the problem is fixed.",
        ],
        related: ["daily-limit", "provider-not-configured"],
      },
      {
        id: "gift-not-showing",
        q: "A member used a gift code but still sees Free. What do I do?",
        a: "Check whether the gift is on their account, then ask them to reload.",
        steps: [
          "Open *Members* and find them. If it worked, their plan shows the gift and when it ends.",
          "If the gift is there, ask them to reload the page, or sign out and in again.",
          "If it is not there, ask for the message they saw and follow the question about gift codes that did not work.",
        ],
        related: ["gift-not-working"],
      },
      {
        id: "cant-sign-in",
        q: "A member cannot sign in. What do I do?",
        a: "Check their confirmation first, then their password.",
        steps: [
          "Open *Members* and find them. If it says *Email not confirmed*, help them confirm first.",
          "Otherwise ask them to use *Forgot password?* on the sign-in page.",
          `Too many tries are blocked for a while (${F.signInTries} in ${F.signInMinutes} minutes). Ask them to wait a little, then try again.`,
        ],
        related: ["member-unconfirmed", "password-reset"],
      },
      {
        id: "something-else",
        q: "Something looks wrong and nothing here helps. What do I do?",
        a: "Write down what happened so it can be fixed quickly.",
        steps: [
          "Write down what you did, what you expected and what happened, with the date and time.",
          "Take a screenshot of the screen.",
          "Send both to whoever looks after the technical side of Scenering.",
        ],
      },
    ],
  },
];

/** Every entry with its topic, in manual order. */
export const MANUAL_ENTRIES: ReadonlyArray<{ topic: ManualTopic; entry: ManualEntry }> = ADMIN_MANUAL.flatMap((topic) => topic.entries.map((entry) => ({ topic, entry })));

export const MANUAL_QUESTION_COUNT = MANUAL_ENTRIES.length;

export function findManualEntry(id: string | null | undefined): { topic: ManualTopic; entry: ManualEntry } | null {
  if (!id) return null;
  return MANUAL_ENTRIES.find((item) => item.entry.id === id) || null;
}

/** The words of a text without the stars and backticks, for searching. */
export function plainManualText(text: string): string {
  return text.replace(/[*`]/g, "");
}

/** Every *screen label* in a text. */
export function screenLabels(text: string): string[] {
  return Array.from(text.matchAll(/\*([^*\n]+)\*/g), (match) => match[1]);
}

/** All the text of an entry, for searching and for checks. */
export function entryText(entry: ManualEntry): string[] {
  return [entry.q, entry.a, ...entry.steps, ...(entry.points || []), ...(entry.tips || [])];
}

/** A search word reduced to a simple stem, so "codes" finds "code" and "replies" finds "reply". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * The entries that contain every word of the query (in any order, any case),
 * grouped by topic. An empty query returns the whole manual.
 */
export function searchManual(query: string, topics: readonly ManualTopic[] = ADMIN_MANUAL): Array<{ topic: ManualTopic; entries: ManualEntry[] }> {
  const words = query.toLowerCase().split(/[^a-z0-9@]+/).filter((word) => word.length > 1).map(stem);
  return topics
    .map((topic) => ({
      topic,
      entries: topic.entries.filter((entry) => {
        if (words.length === 0) return true;
        const text = plainManualText([topic.title, ...entryText(entry)].join(" ")).toLowerCase();
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((group) => group.entries.length > 0);
}

/** The link that opens one answer in the Manual tab. */
export function manualLink(id: string, origin: string): string {
  return `${origin}/admin/email-centre?tab=manual&q=${encodeURIComponent(id)}`;
}
