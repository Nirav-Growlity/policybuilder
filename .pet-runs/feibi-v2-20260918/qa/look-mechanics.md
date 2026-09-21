# 菲比 look mechanics

菲比 is a humanoid chibi sticker-style character. Keep her feet, lower torso, skirt hem, and overall body registration planted while the gaze is expressed by coordinated eye, eyelid, face, and subtle head/upper-body changes. The large purple eyes lead the motion: the complete eye construction remains intact, with pupils/irises and eyelids moving as part of the original eye design rather than adding new eyes. The hat stays attached to the head, with only a restrained follow-through; the blonde hair and blue neck ribbon may lag slightly and remain physically attached. Do not rotate, skew, or tilt the whole sprite.

## Cardinal pose families

- `000` up: body remains front-facing and planted; pupils/irises lift toward the top edge, upper eyelids open slightly, and the head tips upward only a little. Hat brim and hair remain centered.
- `090` screen-right: nose/face center, pupils, and eyelids shift unmistakably toward the viewer's right; the head turns subtly right while the torso and feet remain planted. The hat and hair follow the head without changing identity.
- `180` down: pupils/irises and eyelids point toward the bottom edge; chin/face lowers subtly while the lower body stays fixed. Keep the hat and hair attached and avoid a whole-body bow.
- `270` screen-left: mirror the rightward mechanics in viewer coordinates: face center, pupils, and eyelids turn unmistakably toward the viewer's left, with a restrained head/hair follow-through and stable feet.

## Intermediate motion budget

Interpolate the eye, eyelid, face, and small head-turn changes in even 22.5-degree steps. Keep body height, lower anchor, hat size, hair volume, outfit, blue ribbon, and baseline stable. Diagonals combine the adjacent horizontal and vertical gaze cues without a sudden bend, scale change, or prop jump. The 157.5-to-180 and 337.5-to-000 boundaries must be especially close in scale and registration.

No new props, text, scenery, shadows, glows, detached effects, guide marks, replacement googly eyes, or chroma-key-colored details.
