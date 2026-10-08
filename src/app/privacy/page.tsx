import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Activity } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — Prep Calculator",
  description: "How Prep Calculator by Lean Liger Fitness & Coaching collects, uses, stores and deletes your data.",
};

/**
 * The privacy policy, served at /privacy/.
 *
 * Every statement here describes what the code actually does. When a feature
 * changes what is stored or who it's shared with, update this page in the
 * same change — and bump EFFECTIVE_DATE.
 */
const EFFECTIVE_DATE = "October 7, 2026";
const BUSINESS = "Lean Liger Fitness & Coaching";
const CONTACT_EMAIL = "lean.liger.fitness@gmail.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-primary">{children}</ul>;
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-16 max-w-3xl items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold sm:text-base">Prep Calculator</span>
        </div>
      </header>

      <main className="container max-w-3xl space-y-10 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Prep Calculator is provided by {BUSINESS} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) to members of our programs on
            Whop. This policy explains what information the app collects, why, where it is kept, who it is shared with, and
            how you can delete it. The short version: we only keep what you enter so the app can work for you, we never
            sell it or use it for advertising, and you can delete all of it at any time.
          </p>
        </div>

        <Section title="1. What we collect">
          <p>
            <strong>Your Whop identity.</strong> When you open the app inside Whop, Whop tells us your Whop user ID so we
            can keep your data separate from everyone else&apos;s. When your coach opens the coach dashboard, Whop also
            provides your display name, username and profile photo so your coach can recognise you; we show them there
            and don&apos;t store them. We never receive your email address, password or payment details from Whop.
          </p>
          <p>
            <strong>Information you enter.</strong> Everything else comes from you:
          </p>
          <List>
            <li>Your profile and plan: height, weight, goal weight, age, sex, your daily steps and training days (or activity level), and calculator settings.</li>
            <li>Weigh-ins: date, body weight, and optionally calories eaten and a note.</li>
            <li>Body measurements you log: waist, hips, chest, arms and thighs, with the date.</li>
            <li>
              <strong>Progress photos — only if you choose to add them.</strong> Photos are entirely optional. If you add
              one, we store the image with its date and pose (front, side or back). See &ldquo;Progress photos&rdquo;
              below.
            </li>
            <li>Calorie adjustments you accept from check-ins.</li>
            <li>Daily habits you tick, any daily step counts you enter, rest days, and your weekly self-audit notes.</li>
            <li>
              Food logs: the foods you add, amounts, calories and macros, meal, and date, plus any foods you save to
              &ldquo;My foods&rdquo; (including barcodes).
            </li>
            <li>
              Workouts you log: the exercises, sets, weights and reps, when you started and finished, and any workout note.
            </li>
            <li>
              Your training setup: the programs you pick or build, your default rest time, and any exercises you add
              yourself (name, muscle, equipment, form cues and an optional demo video link).
            </li>
            <li>
              <strong>Lift leaderboard submissions — only if you submit one:</strong> the lift, the weight, your bodyweight,
              the date, the video link you paste and any note, plus your Whop display name, username and profile photo.
            </li>
            <li>
              <strong>Form checks — only if you ask for one:</strong> the exercise, the video link you paste and your
              question, your coach&apos;s feedback, and your Whop display name, username and profile photo.
            </li>
            <li>
              Pause mode, if you use it: the dates you paused and the reason you picked (sick, travelling or other).
            </li>
            <li>
              Reminder settings: your intermittent fasting meal times and the times you choose for weigh-in, habit, bedtime
              downtime and weekly recap reminders (for downtime, your bedtime). If you switch any notifications on, also your time zone and which Whop community you
              opened the app from (so they reach you there at the right time).
            </li>
          </List>
          <p>
            Body weight, food intake and related details are <strong>health information</strong>. We treat them as
            sensitive and use them only to provide the features described below.
          </p>
          <p>
            <strong>Technical information.</strong> Like any website, our hosting provider receives your IP address and
            basic request details (such as the page requested and the time) when the app loads. These are used to deliver
            the app, keep it secure, and limit abuse (for example, capping how many food lookups one connection can make
            per minute).
          </p>
          <p>
            <strong>What we don&apos;t collect.</strong> No advertising or analytics trackers, no tracking cookies, and no
            contact lists. The barcode scanner uses your camera only while it is open: camera images are read on your
            device to find the barcode and are <strong>never uploaded or stored</strong>. The same applies to photos you
            take of a barcode.
          </p>
        </Section>

        <Section title="2. Progress photos (optional)">
          <List>
            <li>
              <strong>Optional.</strong> Nothing in the app requires a photo. You decide whether to add any, and can delete
              each one at any time.
            </li>
            <li>
              <strong>Private by default.</strong> Only you can see your photos. Your coach can see them only while you have
              &ldquo;Share my photos with my coach&rdquo; switched on (it starts off), and you can switch it off at any time,
              which stops access immediately. Photos are never shown to other members, never appear on the leaderboard,
              and are never sent to any other service.
            </li>
            <li>
              <strong>Stripped before upload.</strong> Your phone shrinks each photo and saves a fresh copy before it&apos;s
              uploaded, which removes hidden details such as location, camera and time metadata.
            </li>
            <li>
              <strong>Stored privately.</strong> Photos are kept in Cloudflare&apos;s private storage, linked to your Whop
              user ID, with no public links: each image is only sent after the app has confirmed it&apos;s you (or your
              coach, if you share).
            </li>
            <li>
              <strong>Photos are only available inside Whop</strong>, and are never stored in your browser.
            </li>
          </List>
        </Section>

        <Section title="3. How we use it">
          <List>
            <li>To calculate your timeline, carb cycling plan, roadmap and daily macro targets.</li>
            <li>To compare your weigh-ins with your plan and suggest calorie adjustments.</li>
            <li>To show your Today summary, habit scorecard, badges, food log, and fasting timer.</li>
            <li>To log your workouts, run the rest timer, and chart your lifts and personal records.</li>
            <li>To send the notifications and reminders you switch on.</li>
            <li>To let your coach review your progress and support you (see &ldquo;Your coach&rdquo; below).</li>
            <li>To keep your data in sync across the devices where you open the app in Whop.</li>
          </List>
          <p>
            We do not sell your information, share it for advertising, or use it to make decisions about you beyond the
            calculations you see in the app. The app gives general fitness planning information, not medical advice.
          </p>
        </Section>

        <Section title="4. Where your data is stored">
          <p>
            <strong>Inside Whop:</strong> your data is stored in a database run by our hosting provider, Cloudflare, in
            North America, linked to your Whop user ID. It follows you to any device where you open the app in Whop.
          </p>
          <p>
            <strong>Outside Whop</strong> (for example a direct link): your data stays in your browser&apos;s storage on
            that device only. We never receive it. Clearing your browser&apos;s site data or switching devices loses it;
            on-device food logs older than one year are removed automatically to save space.
          </p>
          <p>
            Your browser also stores small preferences such as the light/dark theme. When the app is opened directly, the
            page address can contain your calculator settings (for example weight and goal) so that a plan can be shared
            with the &ldquo;Share&rdquo; button; it never contains your logs. Only share that link with people you trust.
          </p>
        </Section>

        <Section title="5. Your coach, and who else sees it">
          <p>
            <strong>Your coach.</strong> {BUSINESS} runs this app as part of your coaching program. The owner and admins
            of the Whop you joined can see a <strong>coach dashboard</strong> showing, for each member:
          </p>
          <List>
            <li>your Whop display name, username and profile photo;</li>
            <li>your plan (profile, goal and settings) and how your weight is tracking against it;</li>
            <li>your weigh-ins from the last 4 months, including any calories and notes you added;</li>
            <li>your body measurements from the last 12 months;</li>
            <li>
              your progress photos — <strong>only if you switch on sharing</strong> (see &ldquo;Progress photos&rdquo;);
            </li>
            <li>your habit ticks and any step counts you logged from the last 3 months, with your streaks and weekly scores;</li>
            <li>whether you&apos;re paused right now, the reason you picked and until when;</li>
            <li>your daily food totals (calories, protein, carbs and fat) from the last 2 weeks — not the individual foods.</li>
          </List>
          <p>
            Your coach can only view this, not change it. Only admins of the Whop you&apos;re a member of can open the
            dashboard. Your weekly self-audit notes, saved foods, workouts and training programs are not shown.
          </p>
          <p>
            <strong>Other members</strong> never see your data — unless you choose to join the{" "}
            <strong>community leaderboard</strong>. If you join, other members of the same Whop community see your Whop
            display name and profile photo, your current and best habit streak, this week&apos;s scorecard percentage
            and how many 80%+ days you&apos;ve had this month. Never your weight, measurements, photos, food, workouts or notes. Your time
            zone is stored so your streak follows your own day. You can leave the leaderboard at any time, which removes
            you from it immediately.
          </p>
          <p>
            <strong>Lift leaderboard.</strong> If you submit a squat, bench press or deadlift, the admins of your Whop
            community see everything you submitted (including your bodyweight) so they can check the video. Until they
            approve it, no one else sees it. Once approved, members of the same community see your Whop display name and
            profile photo, the lift, the weight, your weight-to-bodyweight ratio, the date and your video link. Your
            bodyweight isn&apos;t shown, but it can be worked out from the weight and the ratio. The video itself stays
            wherever you uploaded it (for example YouTube); we only store the link. You can withdraw a submission at any
            time, and admins can remove one.
          </p>
          <p>
            <strong>Form checks.</strong> If you ask for a form check, only the admins of your Whop community see it (your
            name and photo, the exercise, your video link and question) so they can reply. Other members never see your
            form checks or the feedback. We only store the link, not the video. You can withdraw or delete one at any time.
          </p>
          <p>We also share information with the services needed to run the app:</p>
          <List>
            <li>
              <strong>Cloudflare</strong> hosts the app and its database. It processes your requests and the data you save
              on our behalf.
            </li>
            <li>
              <strong>Whop</strong> provides sign-in and delivers notifications. When you switch notifications on, we send
              Whop your user ID and the text of each notification so it can deliver it to you — for example your meal times,
              how many habits are left today and your streak, or your weekly recap (scorecard, weight change and average
              protein). If you submit a lift, Whop also delivers the result of the review (the lift, weight, ratio and
              your rank, or the admin&apos;s reason).
            </li>
            <li>
              <strong>Open Food Facts</strong> and <strong>USDA FoodData Central</strong> provide nutrition data. When you
              scan, type a barcode or search for a food, the barcode or search words are sent to them so we can look the
              food up. These requests are made by our server and do not include your identity. Results are cached and
              shared between members to avoid repeat lookups; the cache contains only barcodes, search words and product
              details. If our server can&apos;t reach Open Food Facts, your browser may ask it directly, in which case Open
              Food Facts receives your IP address.
            </li>
            <li>
              <strong>YouTube</strong> (or the site of a video link you added) opens in a new tab only when you tap
              &ldquo;Watch a demo&rdquo; on an exercise. Nothing is sent to it before you tap.
            </li>
          </List>
          <p>
            Each of these services handles data under its own privacy policy. We may also disclose information if required
            by law.
          </p>
        </Section>

        <Section title="6. How long we keep it">
          <p>
            Your data is kept for as long as you use the app, until you delete it. Hosting request logs are kept for a few
            days. Deleted data can remain in our hosting provider&apos;s short-term database backups for up to 30 days before
            it is overwritten.
          </p>
        </Section>

        <Section title="7. Your choices and rights">
          <List>
            <li>
              <strong>Delete everything:</strong> open <strong>Settings</strong> (the gear at the top left) and use{" "}
              <strong>&ldquo;Delete all my data&rdquo;</strong>, then confirm. This permanently removes your weigh-ins, habits, weekly
              notes, measurements, progress photos, food logs, saved foods, workouts, plan and training programs, notification
              settings, leaderboard entry and lift submissions.
            </li>
            <li>
              <strong>Delete or change individual items</strong> directly in the app: weigh-ins, foods, habits and meal
              times can all be edited or removed.
            </li>
            <li>
              <strong>Turn off notifications</strong> at any time: fasting notifications from the fasting card on the
              Nutrition tab (Fasting), and weigh-in, habit, downtime and recap reminders from Settings (the gear at the top left).
            </li>
            <li>
              <strong>Leave the leaderboard</strong> at any time from the Leaderboard tab.
            </li>
            <li>
              <strong>Withdraw a lift submission</strong> (waiting, approved or not) at any time from Leaderboard → Lifts.
            </li>
            <li>
              <strong>Delete a photo, or stop sharing photos with your coach,</strong> at any time from Check-in → Progress
              photos.
            </li>
            <li>
              <strong>Access or a copy:</strong> email us and we will send you the data stored with your Whop user ID.
            </li>
          </List>
          <p>
            Depending on where you live (for example the EU, the UK or California), you may have further rights, such as to
            object to or restrict processing or to complain to a data protection authority. We use your health information
            on the basis of your explicit choice to enter it, and you can withdraw that at any time by deleting it.
          </p>
        </Section>

        <Section title="8. Security">
          <p>
            Data is encrypted in transit (HTTPS). Your identity is verified using a signed token from Whop, and the app only
            ever changes the data that belongs to the verified user. The coach dashboard checks with Whop, every time it
            loads, that the viewer is an admin of your Whop, and shows only that Whop&apos;s current members. Access to our
            hosting and database accounts is restricted to us. No system is perfectly secure, but we work to protect your information and will tell you if a
            breach affects it.
          </p>
        </Section>

        <Section title="9. Children">
          <p>
            The app is intended for adults aged 18 and over. It is not directed at children, and we do not knowingly
            collect information from anyone under 18. If you believe a child has used it, contact us and we will delete
            their data.
          </p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>
            If we change how we handle your information, we will update this page and the effective date above. Significant
            changes will be announced in our Whop community.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            Questions or requests about your data: email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>{" "}
            or message us through our Whop.
          </p>
          <p>{BUSINESS}</p>
        </Section>
      </main>

      <footer className="border-t border-border py-6">
        <p className="container max-w-3xl text-xs text-muted-foreground">
          © 2026 {BUSINESS}. Prep Calculator provides general fitness planning information and is not medical or
          nutritional advice.
        </p>
      </footer>
    </div>
  );
}
