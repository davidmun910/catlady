# Art prompts for Cat Lady Online

The game works without any image files. Each file below is optional: as soon as it exists in `public/art/`,
the game uses it instead of the built-in drawing. Save every image as a **PNG with a transparent background**
(the table texture and card back are the exceptions), square or portrait, at least 512×512 px. File names must
match exactly (lower-case, hyphens).

## Style guide — paste this in front of every prompt
> Cute hand-drawn cartoon illustration in the style of a cozy indie card game, thick clean black ink outlines,
> flat soft pastel colours with light watercolour texture, simple shapes, friendly expression, no text, no
> watermark, no background (transparent), single subject centred, front view, consistent line weight.

## Cats — `public/art/cats/<file>.png`
Every cat: "a fluffy sitting cat facing the viewer, full body, tail curled around its paws". Add the colour and
personality below. Strays get the same look.

| File | Prompt addition |
|---|---|
| `shadow.png` | sleek black cat, calm half-closed eyes |
| `jazz.png` | black cat with a tiny white chest patch, cheeky grin, one ear tilted |
| `lily.png` | small black kitten, big curious eyes |
| `blackberry.png` | plump black cat, round cheeks, content smile |
| `keaton.png` | elegant black cat with long fur, slightly aloof |
| `pablo-picatso.png` | black cat wearing a tiny beret, paint smudge on one paw |
| `chester.png` | small orange tabby kitten, playful |
| `bell.png` | orange cat with a little bell on a ribbon collar |
| `bronte.png` | orange long-haired cat, thoughtful, sitting beside a small book |
| `zeus.png` | large proud orange cat with a lion-like ruff |
| `pumpkin.png` | very round orange cat, sleepy and happy |
| `chairman-meow.png` | orange cat in a formal grey tunic collar, stern dignified expression |
| `cooper.png` | white kitten, fluffy, wide-eyed |
| `gershon.png` | white cat with grey ear tips, gentle smile |
| `snowflake.png` | fluffy white cat, blue eyes, sparkly |
| `sparkle.png` | white cat with a glittery pink collar |
| `sir-cuddleface.png` | enormous fluffy white cat, squished happy face, tiny top hat |
| `sox.png` | white cat with dark grey paws like socks |
| `alvin.png` | cat with black and orange tortoiseshell patches |
| `dinah.png` | cat with orange and white patches, blue eyes |
| `luna.png` | tuxedo cat, black with white chest and paws, moon-shaped white spot on forehead |
| `henriette-van-weelde.png` | calico cat with black, orange and white patches, pearl necklace |
| `florence.png` | golden orange cat with a gentle motherly face (stray) |
| `antoinette.png` | white cat with a small powdered-wig hairstyle and a rose (stray) |
| `eliot.png` | scruffy grey-black street cat, one folded ear, kind eyes (stray) |
| `levar-purrton.png` | white cat with round reading glasses and a tiny rainbow scarf (stray) |
| `zoroaster.png` | black cat with a star-patterned bandana, mysterious (stray) |
| `penny.png` | orange cat batting a copper coin, mischievous (stray) |
| `macak.png` | orange cat lying blissfully in a pile of green catnip leaves (stray) |
| `hemingway.png` | grey-black cat with six toes visible on one paw, beside a tiny typewriter (stray) |
| `sweetheart.png` | calico cat with heart-shaped patch on chest, loving eyes (stray) |
| `moonbeam.png` | white cat glowing softly, crescent moon charm on collar (stray) |
| `waffle.png` | orange cat with a waffle-pattern fur texture on its back, drooling slightly (stray) |
| `cow.png` | white cat with black cow spots, chewing, very hungry look (stray) |
| `truffle.png` | dark chocolate-brown cat, nose lifted sniffing food (stray) |

## Toys — `public/art/toys/<file>.png`
| File | Prompt addition |
|---|---|
| `mouse.png` | grey felt toy mouse with a button eye and string tail |
| `yarn.png` | pink ball of yarn with a loose thread |
| `feather.png` | wooden feather wand toy with blue and purple feathers and a bell |
| `tower.png` | small purple carpeted cat tower with two platforms |
| `post.png` | sisal rope scratching post on a purple base with a dangling pompom |

## Costumes — `public/art/costumes/<file>.png`
Each is "a grumpy orange cat's head and shoulders in an oval golden picture frame, wearing …":
| File | Prompt addition |
|---|---|
| `bunny.png` | white bunny ears headband |
| `pirate.png` | pirate tricorn hat with skull and an eye patch |
| `superhero.png` | blue superhero mask and cape |
| `alien-suit.png` | green alien hood with antennae and one big eye |
| `sailor-outfit.png` | white sailor hat and collar with an anchor |
| `fancy-suit.png` | grey fedora and blue bow tie |
| `crown.png` | gold jewelled crown |
| `frog.png` | green frog hood with big eyes and a red tongue |
| `duck-hat.png` | yellow duck hat with an orange bill |

## Items — `public/art/items/<file>.png`
| File | Prompt |
|---|---|
| `chicken.png` | a roasted chicken drumstick |
| `tuna.png` | an open tin of tuna with a fish on the label |
| `milk.png` | a milk carton with a yellow label |
| `wild.png` | a chicken drumstick, milk carton and tuna tin grouped together |
| `catnip.png` | a small clear zip bag full of green catnip |
| `spray-bottle.png` | a clear plastic spray bottle with a teal trigger |
| `lost-cat.png` | a hand-drawn "LOST CAT — REWARD" poster pinned to a board (the words may appear on the poster) |

## Table and pieces — `public/art/<file>`
| File | Prompt |
|---|---|
| `table.jpg` | top-down photo-like texture of a warm light oak wooden table, soft even lighting, seamless, no objects (opaque JPG, 2048×2048) |
| `card-back.png` | playing card back design: cream background with a pattern of tiny black paw prints and a round pink badge with a cute grey cat face in the centre (opaque, 5:7 portrait) |
| `cat-token.png` | a small wooden game token shaped like a sitting cat, painted matte grey, slight 3D shading, transparent background |
| `vp-token.png` | a pink heart-shaped wooden token with "2VP" hand-written on it, slight 3D shading, transparent background |
| `logo.png` | the words "Cat Lady" in flowing pink script lettering with a white outline and dark drop shadow, transparent background |

## How the game finds the files
Commit the PNGs under `public/art/` and push: the GitHub Pages workflow and the Render server both build the
list of available images automatically. For any other static host, run `npm run art` before uploading so
`public/art/index.json` is up to date.

Tip: generate the whole cat set in one session with the same seed or reference image so the cats match.
