# Feature Ideas for Learnable

## 🎮 Gameplay & Modes
*   **Time Attack / Blitz Mode**: A fast-paced mode where users have to identify as many countries as possible in 60 seconds. You could add time-extensions (+2 seconds) for rapid, consecutive correct answers.
*   **Daily Challenges (Wordle-style)**: A unique, pre-set challenge that is the same for every user each day (e.g., "Find these 10 countries in Africa"). Add a shareable emoji-grid result so users can post their scores to friends.
*   **Multiplayer / "Versus" Mode**: Since you have authentication, you could let users challenge a friend to a head-to-head race. Who can clear Europe the fastest?
*   **Flag & Capital Modes**: Expand beyond just naming the country on a map. Add modes where the prompt is a Flag, a Capital City, or even a famous landmark, and they have to type the country.

## 🌟 Rewards & Engagement
*   **Confetti & Celebrations**: When a user reaches 100% mastery in a region or finishes a tough session, use a library like `canvas-confetti` to trigger a massive confetti explosion.
*   **Sound Design**: Add satisfying, premium UI sounds. A crisp "ding" for a correct answer, a soft "thud" for a typo, and an escalating pitch for a "streak" of correct answers.
*   **Streaks & Badges**: Track consecutive days played. Award badges (e.g., "The Explorer", "Map Nerd", "Cartographer") for hitting milestones, which can be displayed on their new Progress Dashboard.

## 🧠 Enhanced Learning
*   **Mnemonic Hints & Fun Facts**: If the engine detects a user is repeatedly failing on a specific country, have the `TeachingPanel` show a memorable mnemonic, a fun fact, or a cultural detail to anchor their memory.
*   **"Ghost" Pacing**: Show a visual indicator (like a fading progress bar) of their *personal best* time for the current mode, so they are always racing against their past selves.
*   **Dynamic 3D Globe**: If you're currently using a flat SVG map, consider adding a mode that uses `react-globe.gl` to let users spin a 3D earth to find countries. It feels incredibly premium.

## 🗣️ Language Integration
*   **"How Do You Say Hello?" Mode**: As an extension of geography, challenge users to learn the primary language(s) spoken in a country. For example, clicking on Brazil prompts them to identify "Portuguese", or teaching them basic phrases ("Olá") mapped to specific regions.
*   **Multilingual Input**: Allow users to type country names in different languages (e.g., accepting "Deutschland" as well as "Germany", or "España" for "Spain") and grant bonus mastery points for using the country's native language!
*   **Audio Pronunciations**: In the Teaching Panel, include a small audio button that plays the correct pronunciation of the country's name in its native language.

## 💅 UI/UX Polish
*   **Combo Meter**: As they get answers right quickly, build up a combo multiplier on the screen that catches fire (visually) when they get a streak of 5+.
*   **Dark Mode / Theme Unlockables**: Let users unlock cool map themes (e.g., "Neon Cyberpunk", "Vintage Parchment", "Satellite View") by spending mastery points.
