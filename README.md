# German Vocab · Supabase cloud version

1. In Supabase SQL Editor, run `SUPABASE_MIGRATION.sql`.
2. Open `supabase-config.js` and replace `PASTE_YOUR_SB_PUBLISHABLE_KEY_HERE` with your Supabase Publishable key (`sb_publishable_...`).
3. Upload/replace `index.html`, `app.js`, `style.css`, and add `supabase-config.js` to the GitHub repository. `vocab.json` is unchanged.
4. GitHub Pages then provides email/password registration and login. Learning state is synchronized to Supabase `user_state`.

Never put an `sb_secret_...` key in this project.
