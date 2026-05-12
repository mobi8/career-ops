# Multiple Profiles Setup

This career-ops instance supports managing multiple job search profiles. Each profile has:
- `cv-{name}.md` — Candidate CV
- `config/profile-{name}.yml` — Career configuration (name, target roles, compensation)
- `modes/_profile-{name}.md` — Custom evaluation archetypes and framing

## Available Profiles

- **lewis** — Lewis Park (currently active)
- **wife** — Wife's profile (template - needs to be filled in)

## Switching Profiles

### Method 1: Use the helper script
```bash
node switch-profile.mjs lewis    # Switch to Lewis profile
node switch-profile.mjs wife     # Switch to Wife profile
```

This copies the profile files to the active working files:
- `cv-{profile}.md` → `cv.md`
- `config/profile-{profile}.yml` → `config/profile.yml`
- `modes/_profile-{profile}.md` → `modes/_profile.md`

### Method 2: Manual switch (if needed)
```bash
cp cv-wife.md cv.md
cp config/profile-wife.yml config/profile.yml
cp modes/_profile-wife.md modes/_profile.md
```

## Setup Wife Profile

1. Fill in wife's CV: `cv-wife.md`
   - Name, location, phone, email
   - Professional summary
   - Work experience with metrics
   - Education and skills

2. Update career config: `config/profile-wife.yml`
   - `candidate`: Full name, email, phone, location
   - `target_roles`: Primary roles, archetypes
   - `narrative`: Headline, exit story, superpowers
   - `proof_points`: Key achievements with metrics
   - `compensation`: Salary target, currency
   - `location`: Country, city, timezone

3. Customize evaluation frame: `modes/_profile-wife.md`
   - Target roles and what they value
   - Adaptive framing: which proof points for each role type

## Workflow

1. **To evaluate offers for Lewis:**
   ```bash
   node switch-profile.mjs lewis
   /career-ops evaluate {JD or URL}
   ```

2. **To evaluate offers for wife:**
   ```bash
   node switch-profile.mjs wife
   /career-ops evaluate {JD or URL}
   ```

3. **To scan portals for Lewis:**
   ```bash
   node switch-profile.mjs lewis
   /career-ops scan
   ```

4. **To scan for wife:**
   ```bash
   node switch-profile.mjs wife
   /career-ops scan
   ```

## Data Isolation

Each profile has completely separate:
- **CVs** — Different experience, skills, achievements
- **Target roles** — Different archetypes and priorities
- **Compensation** — Different salary expectations
- **Location preferences** — Different work arrangements

But they share:
- **Portal scanner** (`portals.yml`) — Same job sources
- **Report templates** — Same evaluation structure
- **Interview prep** — Shared story bank and company intel

## Git Notes

Both profiles are version-controlled:
- `cv-lewis.md`, `cv-wife.md` — full CV history
- `config/profile-{name}.yml` — profile history
- `modes/_profile-{name}.md` — customization history

The working files (`cv.md`, `config/profile.yml`, `modes/_profile.md`) are just copies of the active profile and should NOT be committed separately.

## Switching Back

Always remember to switch back after working on one profile:

```bash
# Done evaluating wife's offers, switch back to Lewis
node switch-profile.mjs lewis
```

Tip: Add a git hook or post-commit check to verify which profile is currently active.
