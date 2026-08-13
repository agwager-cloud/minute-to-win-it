export type GameDefinition = {
  id: string;
  title: string;
  symbol: string;
  category: string;
  tagline: string;
  duration: string;
  playable: boolean;
  instructions: string[];
};

export const GAMES: GameDefinition[] = [
  { id:'lights-out', title:'Lights Out', symbol:'🏎️', category:'REACTION', tagline:'Five starts. React the instant the lights go out.', duration:'5 starts', playable:true, instructions:['Wait for all five red lights.','Tap the reaction pad the instant the lights go out.','A tap before lights-out is a false start.','Lowest median reaction time wins.'] },
  { id:'time-stop', title:'Time Stop', symbol:'⏱️', category:'INTERNAL TIMING', tagline:'Stop an invisible clock closest to the target time.', duration:'3 targets', playable:true, instructions:['You receive three random target times under 15 seconds.','Each target begins automatically after a 3-second countdown — there is no Ready button.','The clock is visible for the first second, then disappears.','Tap STOP when you think the target time has elapsed. If you do not stop within 20 seconds, that target times out automatically.','Lowest total absolute error wins.'] },
  { id:'shrink-ring', title:'Shrink Ring', symbol:'🎯', category:'PRECISION', tagline:'Stop three sweeping rings as the target zone shrinks.', duration:'3 rings', playable:true, instructions:['Tap STOP while the sweeping needle is inside the green zone.','Score up to 100 points per ring based on distance from the centre.',"A successful hit shrinks the next ring\'s green zone.",'You have 8 seconds per ring. Highest total score wins.'] },
  { id:'parry', title:'Parry', symbol:'⚔️', category:'REACTION', tagline:'Read the tell, ignore the feint, parry the strike.', duration:'Coming soon', playable:false, instructions:['Tap only on a genuine attack.','Feints punish anticipation.'] },
  { id:'blind-beat', title:'Blind Beat', symbol:'🥁', category:'RHYTHM', tagline:'Keep the beat after the metronome disappears.', duration:'Coming soon', playable:false, instructions:['Tap with the visible beat.','Continue when the cue disappears.'] },
  { id:'overpour', title:'Overpour', symbol:'🥤', category:'HOLD + RELEASE', tagline:'Release the pour exactly on the fill line.', duration:'Coming soon', playable:false, instructions:['Hold to pour.','Release at the target line.'] },
  { id:'charge-shot', title:'Charge Shot', symbol:'🚀', category:'HOLD + RELEASE', tagline:'Build exactly enough power to land on target.', duration:'Coming soon', playable:false, instructions:['Hold to charge.','Release to launch.'] },
  { id:'drift-line', title:'Drift Line', symbol:'🏁', category:'CONTINUOUS CONTROL', tagline:'Keep the drift angle inside the perfect band.', duration:'Coming soon', playable:false, instructions:['Make small corrections.','Stay inside the drift band.'] },
  { id:'stack', title:'Stack', symbol:'🧱', category:'SPATIAL', tagline:'Drop moving blocks with almost no overhang.', duration:'Coming soon', playable:false, instructions:['Tap to drop.','Overhang is sliced away.'] },
  { id:'trace', title:'Trace', symbol:'✏️', category:'SPATIAL', tagline:'Guide the cursor along the path with minimal deviation.', duration:'Coming soon', playable:false, instructions:['Drag to move the cursor.','Accuracy matters more than speed.'] },
  { id:'ricochet', title:'One Shot Ricochet', symbol:'💥', category:'ANGLE', tagline:'One shot. Multiple bounces. Tiny errors compound.', duration:'Coming soon', playable:false, instructions:['Aim the first bounce.','Predict the remaining ricochets.'] },
  { id:'knife-wheel', title:'Knife Wheel', symbol:'🔪', category:'TIMING + SPACE', tagline:'Thread knives into shrinking gaps on a spinning wheel.', duration:'Coming soon', playable:false, instructions:['Tap to throw.','Do not hit an existing knife.'] },
  { id:'conveyor-chef', title:'Conveyor Chef', symbol:'👨‍🍳', category:'TRACKING', tagline:'Cut moving ingredients exactly on their marked line.', duration:'Coming soon', playable:false, instructions:['Track the moving cut line.','Tap when it reaches the knife.'] },
  { id:'pole-balance', title:'Pole Balance', symbol:'🤹', category:'MICRO-CONTROL', tagline:'Balance the pole while walking it to the marker.', duration:'Coming soon', playable:false, instructions:['Use tiny corrections.','Overcorrection creates momentum.'] },
];

export const GAME_BY_ID = new Map(GAMES.map(game => [game.id, game]));
export const PLAYABLE_GAMES = GAMES.filter(game => game.playable);
