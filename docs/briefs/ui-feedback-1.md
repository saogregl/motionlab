Yes. The current result is clean enough, but it still reads as “prompt-generated enterprise UI” rather than “mature CAD/simulation product.”

The main issue is not that any one component is bad. It is that everything is treated with roughly the same visual importance, spacing rhythm, and component language. Onshape/xDesign feel convincing because they have **aggressive hierarchy, purposeful density, very restrained ornament, and strong domain-specific chrome**. Your current result is too even, too polite, and too generic. It does not yet feel like a tool that has been sharpened by daily engineering use. Compared to the intent in your [ui-epic.md](sandbox:/mnt/data/ui-epic.md), the screenshots still under-deliver on density, hierarchy, and domain-specific affordances. 

## The 8 biggest reasons it still feels “AI-like”

### 1. Everything is too uniformly spaced

Real CAD tools are not “beautifully padded.” They are **densely organized with selective breathing room**. In your UI, the left tree, inspector, floating dialog, viewport HUD, and timeline all use a similar soft rhythm. That makes the whole thing feel like one generic design system rather than a tuned workstation.

What to do:

* Shrink most panel internals by about 15–25%.
* Make the tree rows tighter.
* Make inspector section headers tighter.
* Reduce empty margins in the floating tool card.
* Keep only the viewport as the large breathing space.

### 2. The chrome is too minimal in the wrong places

Onshape and xDesign are not minimal in the “landing page” sense. They are minimal in the sense of **high information density with disciplined visual noise**.

Your UI is missing:

* a real tool/action bar
* domain-specific toolbar groupings
* richer viewport utility chrome
* more obvious view/navigation controls
* more visible interaction affordances in the tree and inspector

Right now it feels like a general admin shell wrapped around a viewport.

### 3. The viewport feels empty and under-instrumented

The inspirations feel alive because the viewport is the center of gravity. Even when geometry is simple, there is always meaningful overlay structure:

* view cube
* mode toggles
* result legends
* connection overlays
* richer active selection states
* section/analysis controls
* clearer transform/selection HUD

Your viewport is mostly a blank canvas with a tiny chip and a weak cube placeholder. That makes the shell dominate the experience.

### 4. The left and right panels are too generic

The left tree and right inspector still look like standard React app panels, not engineering panels.

Symptoms:

* row styling is soft and generic
* icons are underpowered
* section headers lack crisp structure
* values and labels do not align with “instrument panel” discipline
* numeric inputs still look like web form controls

### 5. The light theme is especially bland

The light theme is not offensive, but it is too gray, too low in structure, and too monotone in surface treatment. The references use light themes with:

* stronger border logic
* slightly varied panel surfaces
* better-defined subpanels
* clearer separators
* more deliberate “machined” crispness

Your light theme feels like a neutral Figma canvas, not a professional CAD environment.

### 6. The dark theme is too flat and samey

The dark theme currently has a nice mood, but it lacks local contrast steps. The left panel, central area, right panel, bottom dock, and top chrome are too close together in luminance. Mature tools usually use **more tonal layering**, not less.

### 7. Inputs and dialogs still look like shadcn defaults wearing a costume

The floating “Create Datum” card is the clearest example. It is acceptable, but it still looks like a standard web settings form. Real tool cards in CAD products feel:

* tighter
* more operational
* less form-like
* more command-like
* more anchored to the viewport context

### 8. It lacks tiny moments of product-specific character

The inspirations do not rely on branding flourishes. Their character comes from:

* very specific iconography
* precise row heights
* highly tuned borders
* grid/axis conventions
* tiny state indicators
* engineering colors used sparingly
* purposeful contextual overlays

That is the last 20% you are missing.

---

# Granular feedback by region

## 1. Top bar

Current problem:

* Too empty.
* Too thin in functionality.
* Reads like app header, not workstation chrome.

What inspiration does better:

* It compresses identity, document context, primary tools, search, and utility actions into a clearly segmented top region.
* It uses more icons and control density without feeling messy.

What to change:

* Add a true secondary action cluster in the top bar or just below it.
* Tighten title/breadcrumb spacing.
* Reduce the visual prominence of “MotionLab” relative to active document context.
* Make compile/state status feel like a real state indicator, not a little text in the corner.
* Add grouped utility buttons on the right: selection mode, display mode, section, measure, search/command, settings/help.

Do this concretely:

* Keep app brand at low emphasis.
* Make `Water Pump Assembly` the dominant context.
* Add subtle separators between app identity, document context, and tool clusters.
* Use 1px borders, not large contrast jumps.
* Make icon buttons 28px or 30px, not roomy.
* Add disabled/inactive/active states that are clearly different.

A better structure would be:

* left: brand → document / workspace → mode
* center-left: domain toolbar groups
* center-right: search / command
* right: compile status → utilities → avatar/help

## 2. Secondary toolbar

This is one of the biggest missing ingredients.

Your current UI has almost no visible operational toolbar language. The references all show that the “realness” comes from having a dense strip of meaningful controls.

What to add:

* Create/Edit tools
* View tools
* Selection filters
* Analysis tools
* Playback / simulation controls
* Visibility/display toggles

Styling guidance:

* Use flat icon buttons with compact spacing.
* Group them with subtle separators.
* Avoid big rounded pills.
* Avoid large call-to-action buttons except for specific tool confirmations.

This single addition would move the UI a lot closer to Onshape.

## 3. Left structure panel

Current problem:

* Too empty.
* Tree rows are readable but generic.
* No richness in row anatomy.
* Feels like a basic explorer.

What to change:

* Tighten row height.
* Strengthen icon grammar.
* Add hover-revealed controls.
* Improve indentation rhythm.
* Make selected row more assertive and more “tool-like.”

Specific changes:

* Tree row height around 24–26px in compact mode.
* Reduce vertical slack between groups.
* Make group headers more distinct from items.
* Use stronger but smaller icons.
* Add row-end affordances on hover: eye, isolate, menu.
* Use a thin left accent line or inset selection background for selected state.
* Make inactive text lower contrast, but keep selected text strong.

Important:
The tree should not feel like a file explorer. It should feel like a **mechanism graph / scene graph / assembly graph**.

Row anatomy should feel more engineered:

* disclosure
* type icon
* label
* subtype / count / status
* visibility
* issue/status
* context menu

## 4. Right inspector

Current problem:

* Too much like a conventional property sheet.
* Sections are visually weak.
* Inputs look generic.
* Labels and values do not yet form a strong grid.

What to change:

* Make the inspector feel more like an instrument/control surface.
* Improve label-value alignment.
* Reduce padding.
* Make section headers more structural.
* Give numeric fields stronger tabular rhythm.

Specific changes:

* Narrow the section padding.
* Make section headers slightly darker/lighter than the panel background.
* Use tighter row heights.
* Give labels a fixed width and slightly muted tone.
* Make numeric inputs more compact and more “mechanical.”
* Use tabular numerals everywhere.
* Use axis colors very sparingly and only where they help.

Big improvement:
Turn `Transform` into a more deliberate module:

* grouped XYZ fields
* axis-colored prefixes
* aligned units
* optional small reset buttons
* subtle hover state on each property row

Also:
The header for the selected object should feel more product-grade. Right now it is a generic title block. Add:

* stronger type glyph
* entity type label
* build/compile/validity badge
* context actions

## 5. Floating tool card

Current problem:

* Too much like a regular form dialog.
* Not enough like a tool prompt.
* Feels detached from the viewport.

What to change:

* Tighten it.
* Reduce form padding.
* Increase operational clarity.
* Make it feel more like a temporary command surface.

Concrete changes:

* Smaller title area.
* More compact field rows.
* Buttons should be smaller and tighter.
* Stronger distinction between cancel and confirm.
* Better shadow in light mode, subtler shadow in dark mode.
* Slightly more anchored placement relative to where the action happens.

Best improvement:
Make the card feel like it belongs to the viewport, not like a floating admin popover.

That means:

* slightly stronger border
* smaller radius
* tighter spacing
* maybe a subtle “tool mode” tint or accent in the header
* better proximity to selected object or active viewport quadrant

## 6. View cube / viewport HUD

Current problem:

* Placeholder quality.
* No convincing HUD composition.
* Too little visible utility.

What to change:

* Replace “View Cube” button-like placeholder with an actual cube or at least a proper cube-styled control.
* Add a more deliberate HUD stack in the top-right.
* Add secondary display buttons below it.

Suggested viewport HUD layout:

* top-right: view cube
* below it: display mode, section, isolate, shading, visibility
* bottom-left: axis triad
* bottom-center: selection chip
* bottom-right: study/result legend or playback readout

The view cube is a credibility multiplier. A weak placeholder instantly makes the UI feel fake.

## 7. Bottom dock / timeline

Current problem:

* Too generic.
* Too much empty horizontal space with too little behavioral structure.
* The timeline looks like a thin scrubber, not like part of a serious analysis workflow.

What to change:

* Strengthen top border and tab hierarchy.
* Make transport controls more deliberate.
* Give time readout stronger prominence.
* Make the scrubber feel more like a scale with actionable precision.

Specific improvements:

* Tabs should be tighter and sharper.
* Make active tab clearer.
* Slightly darken or lighten the dock relative to viewport.
* Add more visible tick structure to the time ruler.
* Make playhead handle a bit more intentional.
* Group transport controls into a compact cluster.
* Increase the informational density of the right side: elapsed, total, speed, loop state.

Onshape-like dock feeling comes from:

* tabs that look like real work modes
* crisp ruler/tick system
* strong readout alignment
* no extra softness

## 8. Workspace tabs at bottom-left

These are okay, but they still look a bit like generic browser tabs.

What to change:

* Reduce their visual softness.
* Make active tab feel more precise and utility-oriented.
* Avoid large padding and over-rounded corners.
* Make them feel more like document/workspace tabs in CAD, less like web tabs.

---

# Visual language changes that will have disproportionate payoff

## 1. Reduce border radius almost everywhere

This is a major one.

Your current UI still has a slightly “modern SaaS” softness. The inspirations are much crisper.

Do this:

* panels: very small radius or none
* inputs: 3–5px
* cards: 6–8px max
* buttons: 4–6px
* only pills/badges should feel pill-like

This alone will remove a lot of the AI-generated feel.

## 2. Use more border logic, less shadow logic

Right now the layout relies too much on soft separation. CAD apps feel crisp because they use:

* borders
* tone steps
* insets
* rails
* separators

and only small shadows where needed.

Use shadow only for:

* floating tool card
* menus
* selection chip
* popovers

Do not let the main shell feel shadow-based.

## 3. Increase tonal separation between major shells

Especially in dark mode, define 4 levels clearly:

* app background
* top/bottom chrome
* side panels
* viewport

Right now too many surfaces are nearly the same. The result is tasteful but mushy.

Suggested principle:

* viewport should be the darkest or most visually recessive plane
* tool chrome should sit above it
* side panels should be readable but not bright
* floating surfaces should be clearly elevated

## 4. Tighten typography

The current typography is decent, but it is too uniform.

Do this:

* stronger size contrast between document title and metadata
* smaller tree text
* slightly smaller inspector labels
* tabular numerals everywhere numbers appear
* fewer semibold labels overall
* reserve strong weight for true hierarchy moments only

One common AI-UI mistake is overusing medium/semibold. It makes everything feel equally important.

## 5. Make selection states bolder and more domain-specific

Selected row, selected object, selected property, selected mode should all feel unambiguous.

Use:

* inset accent
* stronger local contrast
* thin colored edge
* selected object chip with type icon
* optionally a secondary state color for “hovered but not selected”

Right now selection is acceptable but not authoritative.

---

# Light theme: what specifically needs fixing

The light theme is where the genericness shows the most.

## Problems

* Very flat gray field.
* Side panels do not feel distinct enough from viewport.
* Inputs disappear into the panel.
* There is not enough local structure.
* It lacks the “precision instrument” character from Onshape.

## Fixes

* Make viewport slightly darker than surrounding shell.
* Give side panels a cleaner white/off-white base.
* Use more explicit section backgrounds in inspector.
* Make dividers slightly more visible.
* Use stronger field chrome around inputs.
* Give the bottom dock a clearer surface step.
* Reduce the amount of “light gray everything.”

Think:

* shell background
* panel white
* inset light gray
* viewport neutral cool gray
* selected row pale blue
* active control crisp blue

Not:

* one family of nearly identical pale grays.

---

# Dark theme: what specifically needs fixing

## Problems

* Beautifully subdued, but too uniform.
* The viewport and panels blend together.
* The hierarchy depends too much on text and borders instead of surface planes.
* It feels like a dark-themed admin app rather than workstation software.

## Fixes

* Separate viewport from panels more clearly.
* Slightly raise panel backgrounds.
* Slightly darken app frame.
* Give the dock and top chrome their own tonal band.
* Increase the clarity of section headers in the inspector.
* Make the floating tool card feel more elevated than the rest.

You want the dark theme to feel like:

* engineered
* calm
* deep
* precise

not:

* merely dark.

---

# Component-specific redesign notes

## Tree row

Change from:

* roomy
* simple icon + text

To:

* compact
* denser
* subtle hover actions
* stronger selected state
* more domain metadata

## Property row

Change from:

* form label + input

To:

* label rail + value rail + unit rail
* more fixed alignment
* compact precision
* hover affordances for reset/scrub/edit

## Numeric inputs

Change from:

* standard web input

To:

* compact instrument field
* tabular numerals
* stronger border
* clear focus ring
* optional inline steppers or scrub handle behavior
* tighter paddings

## Section headers

Change from:

* plain text with caret

To:

* distinct subpanel strip
* slightly different surface
* clearer collapse affordance
* stronger grouping signal

## Floating card

Change from:

* shadcn dialog card

To:

* viewport tool card
* tighter
* more operational
* more anchored
* less decorative

---

# “Closer to inspiration” style rules you should enforce

These will help the next pass avoid drifting back into AI-generated softness.

## Hard rules

1. No oversized padding inside any panel.
2. No large rounded corners except where explicitly justified.
3. No generic full-width web form styling in inspector/tool cards.
4. No equal visual treatment across all surfaces.
5. No empty headers.
6. No placeholder controls that look like labels.
7. No single accent color used everywhere.
8. No shadows on primary shell panels.
9. No typography scale that makes labels and values feel equally important.
10. No UI region should exist without a clear job.

## Positive rules

1. Every major band of chrome must have a defined role.
2. Every row should expose more affordance on hover than at rest.
3. Every numeric field should look precision-oriented.
4. Every viewport overlay should feel intentional and domain-specific.
5. Every section should have a stronger internal alignment system.
6. Every selected state should be unmistakable.

---

# What I would prioritize for the next iteration

## Pass 1: biggest visual gain for least effort

* Add a real secondary toolbar.
* Reduce border radii.
* Tighten tree and inspector density.
* Improve tonal separation of shell vs viewport vs panels.
* Replace fake “View Cube” placeholder with something much more believable.
* Make floating tool card tighter and more operational.

## Pass 2: remove the remaining “SaaS UI” feeling

* Redesign numeric inputs.
* Improve property row alignment.
* Add hover actions in tree rows.
* Strengthen section headers.
* Sharpen dock/timeline styling.
* Increase icon specificity.

## Pass 3: domain credibility

* Better engineering icons.
* Richer viewport HUD.
* More visible study/result overlays.
* Smarter selection/hover behaviors.
* Proper view/navigation/display tool cluster.

---

# A blunt diagnosis of the current screenshots

The current result looks like:
“a good internal prototype for an engineering app.”

The inspirations look like:
“a product that has been used, criticized, and refined by engineers for years.”

That gap is mostly not about prettier colors. It is about:

* density tuning
* chrome hierarchy
* domain affordances
* precision in component anatomy
* a stricter anti-softness discipline

---

# A practical direction sentence

> Push the UI away from “clean SaaS admin panel” and toward “high-density professional CAD workstation.” Reduce padding and corner radius across the shell, introduce a real secondary engineering toolbar, make tree rows and inspector rows more compact and operational, strengthen tonal separation between viewport and side chrome, redesign numeric/property inputs to feel precision-oriented rather than form-like, and replace placeholder viewport controls with believable domain-specific HUD components similar in density and hierarchy to Onshape/xDesign.
