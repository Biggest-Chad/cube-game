/**
 * ============================================================================
 * CUBE GAME — MASTER CONSTRAINTS
 * ============================================================================
 *
 * Single pane of glass for performance, difficulty, combat, economy, and
 * targeting. Tweak values here; systems read these names instead of magic
 * numbers.
 *
 * Naming: SCREAMING_SNAKE_CASE, unique, and readable at a glance.
 * Import-leaf — no game-system imports — so every module can read it.
 *
 * Drone seed is independent of the main gun so the +100% drone / +50% gun
 * passes do not stack. Guided-missile homing is +50% vs the 0.65 baseline.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. MAIN GUN  (ship nose cannon — not modular hardpoints)
// ═══════════════════════════════════════════════════════════════════════════

/** Pre-tweak baseline used to derive the +50% main-gun pass. */
const LEGACY_MAIN_GUN_BASE_DAMAGE = 13;

/** Damage per main-gun bolt before crit / upgrades / research. Was 13; +50%. */
export const MAIN_GUN_BASE_DAMAGE = LEGACY_MAIN_GUN_BASE_DAMAGE * 1.5;

/** Bolts per second at rank 0 with no fire-rate upgrades. */
export const MAIN_GUN_BASE_FIRE_RATE = 5.8;

/** World-units per second the plasma bolt travels. */
export const MAIN_GUN_PROJECTILE_SPEED = 105;

/** Max aim / lock range of the main gun (world units). */
export const MAIN_GUN_BEAM_RANGE = 120;

/** Visual lance lifetime (seconds). */
export const MAIN_GUN_BEAM_DURATION = 0.14;

/** Concurrent bolts at rank 0. */
export const MAIN_GUN_MULTI_SHOT_BASE = 1;

/** Splash radius at rank 0 (0 = none until Shock Halo). */
export const MAIN_GUN_SPLASH_RADIUS_BASE = 0;

/** Auto-fire when the trigger is held. */
export const MAIN_GUN_AUTO_FIRE = true;

/** Stick aim cone half-angle (radians) around ship→cube. */
export const MAIN_GUN_AIM_STICK_CONE_RADIANS = 0.56;

/** Soft-lock angular slack vs enemy drones (1 − dot). */
export const MAIN_GUN_ENEMY_LOCK_ANGULAR_SLACK = 0.18;

/** Block raycast half-extent used for main-gun aim assist. */
export const MAIN_GUN_AIM_BLOCK_HALF_EXTENT = 0.62;

/** Inner / outer cone radii (radians) for miss-assist samples. */
export const MAIN_GUN_CONE_ASSIST_INNER_RADIANS = 0.12;
export const MAIN_GUN_CONE_ASSIST_OUTER_RADIANS = 0.22;
export const MAIN_GUN_CONE_ASSIST_INNER_SAMPLES = 4;
export const MAIN_GUN_CONE_ASSIST_OUTER_SAMPLES = 6;

/** Bolt travel extra length so fast lances do not tunnel voxels. */
export const MAIN_GUN_BOLT_RAYCAST_LEAD = 0.75;

/** Fat AABB half-extent for in-flight bolt vs shell. */
export const MAIN_GUN_BOLT_BLOCK_HALF_EXTENT = 0.58;

/** Extra radius when a bolt sweeps an enemy drone. */
export const MAIN_GUN_BOLT_ENEMY_SWEEP_PADDING = 0.35;

/** Default armor pierce on the un-upgraded main gun. */
export const MAIN_GUN_BASE_ARMOR_PIERCE = 0.05;

/** Heat added per main-gun bolt. */
export const MAIN_GUN_HEAT_PER_SHOT = 0.05;

/** Heat bled per second while idle. */
export const MAIN_GUN_HEAT_COOL_RATE = 0.35;

// ═══════════════════════════════════════════════════════════════════════════
// 2. PLAYER DRONES
// ═══════════════════════════════════════════════════════════════════════════

/** Pre-tweak shared combat seed (drones used to scale off the main gun). */
const LEGACY_DRONE_DAMAGE_SEED = 13;

/**
 * Shared damage seed for every player-drone role. Was 13 (same as the gun);
 * +100% so drone DPS is independent of the main-gun +50% pass.
 */
export const DRONE_BASE_DAMAGE = LEGACY_DRONE_DAMAGE_SEED * 2;

/** Shots per second before role / upgrade / heat modifiers. */
export const DRONE_BASE_FIRE_RATE = 2.2;

/** Bomber warhead multiplier on DRONE_BASE_DAMAGE. */
export const DRONE_BOMBER_WARHEAD_DAMAGE_FRACTION = 1.8;

/** Bomber splash retains this fraction of the applied warhead. */
export const DRONE_BOMBER_SPLASH_DAMAGE_FRACTION = 0.45;

/** Bomber bomb flight speed (world units / sec). */
export const DRONE_BOMBER_PROJECTILE_SPEED = 18;

/** Fighter peel / mining shot vs cube blocks. */
export const DRONE_FIGHTER_BLOCK_DAMAGE_FRACTION = 0.35;

/** Fighter shot vs hostile drones. */
export const DRONE_FIGHTER_ANTI_DRONE_DAMAGE_FRACTION = 0.55;

/** Fighter shot vs intercepts (spikes, orbs). */
export const DRONE_FIGHTER_POINT_DEFENSE_DAMAGE_FRACTION = 0.5;

/** Defender shot vs intercepts. */
export const DRONE_DEFENDER_POINT_DEFENSE_DAMAGE_FRACTION = 0.35;

/** Defender shot vs hostile drones. */
export const DRONE_DEFENDER_ANTI_DRONE_DAMAGE_FRACTION = 0.4;

/** Seconds to respawn a destroyed player drone (before upgrades). */
export const DRONE_RESPAWN_SECONDS = 8;

/** Seconds after last hit before a defender shield starts recharging. */
export const DRONE_SHIELD_REGEN_DELAY_SECONDS = 4;

/** Defender frontal-shield points restored per second. */
export const DRONE_SHIELD_REGEN_PER_SECOND = 6;

/** Absolute bay / fielded-drone cap. */
export const DRONE_BAY_MAXIMUM = 18;

/** Bays owned at a fresh save. */
export const DRONE_BAY_STARTING_COUNT = 0;

/** Ally Protocol — first drone unlock (FRAG). */
export const DRONE_ALLY_PROTOCOL_COST_FRAGMENTS = 100;

/** Next-bay cost = round(BASE × GROWTH ^ ownedBays). */
export const DRONE_BAY_UNLOCK_COST_BASE = 113;
export const DRONE_BAY_UNLOCK_COST_GROWTH = 1.48;

/** Legacy geometric drone-cost curve (soft-cap helper). */
export const DRONE_LEGACY_COST_BASE = 34;
export const DRONE_LEGACY_COST_GROWTH = 1.42;
export const DRONE_LEGACY_SOFT_COST_BASE = 60;

/** Hard fleet ceiling referenced by older tech-tree caps. */
export const DRONE_ABSOLUTE_HARD_CAP = 24;

/** Heat added while a drone is occluded / hidden. */
export const DRONE_HIDDEN_HEAT_GAIN_PER_SECOND = 0.08;

/** Heat bled while a drone has line of fire. */
export const DRONE_VISIBLE_HEAT_BLEED_PER_SECOND = 0.15;

/** Fire-rate floor so heat cannot stall a drone forever. */
export const DRONE_MINIMUM_FIRE_RATE = 0.25;

// —— Role kits (Fighter / Bomber / Defender) ——

/** Extra +50% fighter/bomber base damage (defenders unchanged). */
const FIGHTER_BOMBER_DAMAGE_PASS = 1.5;

export const FIGHTER_BLOCK_DAMAGE_MULTIPLIER = 0.65625 * FIGHTER_BOMBER_DAMAGE_PASS;
export const FIGHTER_SPLASH_RADIUS = 0;
export const FIGHTER_ARMOR_PIERCE = 0;
export const FIGHTER_ANTI_DRONE_MULTIPLIER = 2.25 * FIGHTER_BOMBER_DAMAGE_PASS;
export const FIGHTER_POINT_DEFENSE_MULTIPLIER = 1.2;
export const FIGHTER_FRONTAL_SHIELD = 0;
export const FIGHTER_FIRE_RATE_MULTIPLIER = 1.4;
export const FIGHTER_ORBIT_RADIUS_BIAS = 0;
export const FIGHTER_BASE_HIT_POINTS = 40;
export const FIGHTER_UNIT_COST_FRAGMENTS = 90;
export const FIGHTER_TYPE_UNLOCK_COST_FRAGMENTS = 0;
export const FIGHTER_UNLOCK_LEVEL = 1;

export const BOMBER_BLOCK_DAMAGE_MULTIPLIER = 1.65 * FIGHTER_BOMBER_DAMAGE_PASS;
export const BOMBER_SPLASH_RADIUS = 1.6;
export const BOMBER_ARMOR_PIERCE = 0.2;
export const BOMBER_ANTI_DRONE_MULTIPLIER = 0.15 * FIGHTER_BOMBER_DAMAGE_PASS;
export const BOMBER_POINT_DEFENSE_MULTIPLIER = 0;
export const BOMBER_FRONTAL_SHIELD = 0;
export const BOMBER_FIRE_RATE_MULTIPLIER = 0.38;
export const BOMBER_ORBIT_RADIUS_BIAS = 4.5;
export const BOMBER_BASE_HIT_POINTS = 70;
export const BOMBER_UNIT_COST_FRAGMENTS = 150;
export const BOMBER_TYPE_UNLOCK_COST_FRAGMENTS = 135;
export const BOMBER_UNLOCK_LEVEL = 4;

export const DEFENDER_BLOCK_DAMAGE_MULTIPLIER = 0;
export const DEFENDER_SPLASH_RADIUS = 0;
export const DEFENDER_ARMOR_PIERCE = 0;
export const DEFENDER_ANTI_DRONE_MULTIPLIER = 0.9;
export const DEFENDER_POINT_DEFENSE_MULTIPLIER = 1.5;
export const DEFENDER_FRONTAL_SHIELD = 22;
export const DEFENDER_FIRE_RATE_MULTIPLIER = 1.1;
export const DEFENDER_ORBIT_RADIUS_BIAS = -2.5;
export const DEFENDER_BASE_HIT_POINTS = 55;
export const DEFENDER_UNIT_COST_FRAGMENTS = 165;
export const DEFENDER_TYPE_UNLOCK_COST_FRAGMENTS = 180;
export const DEFENDER_UNLOCK_LEVEL = 6;

// ═══════════════════════════════════════════════════════════════════════════
// 3. GUIDED MISSILES  (tracking / accuracy live here)
// ═══════════════════════════════════════════════════════════════════════════

/** Pre-tweak seeker gain on the Guided Missiles weapon. */
const LEGACY_GUIDED_MISSILE_HOMING = 0.65;

/**
 * Seeker strength 0–1 written into weapon.baseStats.homing.
 * Was 0.65; +50% tracking / accuracy.
 */
export const GUIDED_MISSILE_HOMING_STRENGTH = LEGACY_GUIDED_MISSILE_HOMING * 1.5;

/** Armed turn = homing × this gain, applied as lerp(vel, desired, turn×dt). */
export const GUIDED_MISSILE_ARMED_TURN_GAIN = 5.5;

/** Coasting (pre-lock) turn = homing × this gain. */
export const GUIDED_MISSILE_COASTING_TURN_GAIN = 0.35;

/** Seconds of lateral rack-coast before seekers arm. */
export const GUIDED_MISSILE_ARM_DELAY_SECONDS = 0.22;

/** Extra random arm delay so a salvo fans out. */
export const GUIDED_MISSILE_ARM_DELAY_SPREAD_SECONDS = 0.12;

/** Extra arm delay per stacked rank in a salvo. */
export const GUIDED_MISSILE_ARM_DELAY_PER_RANK_SECONDS = 0.05;

/** Speed multiplier once the seeker is armed. */
export const GUIDED_MISSILE_ARMED_SPEED_MULTIPLIER = 1.08;

/** Speed multiplier while still coasting off the rack. */
export const GUIDED_MISSILE_COASTING_SPEED_MULTIPLIER = 0.92;

/** Max missile lifetime (seconds). */
export const GUIDED_MISSILE_LIFETIME_SECONDS = 4.0;

/** World-radius cull (too far from origin). */
export const GUIDED_MISSILE_MAX_RANGE_FROM_ORIGIN = 220;

/** Extra world units added to the in-flight block raycast. */
export const GUIDED_MISSILE_RAYCAST_LEAD = 0.75;

/** Fat AABB half-extent vs shell (does NOT steal nucleus hits — see §6). */
export const GUIDED_MISSILE_BLOCK_HALF_EXTENT = 0.6;

/** Extra fuse radius on the nucleus sphere. Kept small so the hull still occludes. */
export const GUIDED_MISSILE_NUCLEUS_PROXIMITY_PADDING = 0.22;

/** Hunter-Killer bonus vs Core / Data Node. */
export const GUIDED_MISSILE_HUNTER_PRIORITY_DAMAGE_MULTIPLIER = 1.25;

/** Splash damage fraction applied to neighbors. */
export const GUIDED_MISSILE_SPLASH_DAMAGE_FRACTION = 0.3;

/** Pooled in-flight missiles. */
export const GUIDED_MISSILE_POOL_SIZE = 24;

/** Trail ribbon samples. */
export const GUIDED_MISSILE_TRAIL_SEGMENTS = 18;

/** Explosion VFX pool. */
export const GUIDED_MISSILE_EXPLOSION_POOL_SIZE = 12;

// —— Guided Missiles weapon card (base stats) ——

export const GUIDED_MISSILE_BASE_DAMAGE = 48;
export const GUIDED_MISSILE_BASE_FIRE_RATE = 0.85;
export const GUIDED_MISSILE_BASE_PROJECTILE_SPEED = 38;
export const GUIDED_MISSILE_BASE_RANGE = 100;
export const GUIDED_MISSILE_BASE_SPLASH_RADIUS = 1.1;
export const GUIDED_MISSILE_BASE_SPLASH_FALLOFF = 0.5;
export const GUIDED_MISSILE_BASE_ARMOR_PIERCE = 0.15;
export const GUIDED_MISSILE_BASE_CRIT_CHANCE = 0.08;
export const GUIDED_MISSILE_BASE_CRIT_MULT = 2.0;
export const GUIDED_MISSILE_HEAT_PER_SHOT = 0.18;
export const GUIDED_MISSILE_HEAT_COOL_RATE = 0.25;
export const GUIDED_MISSILE_BURST_SIZE = 2;
export const GUIDED_MISSILE_SHOP_COST_FRAGMENTS = 420;
export const GUIDED_MISSILE_SHOP_MIN_LEVEL = 4;

// ═══════════════════════════════════════════════════════════════════════════
// 4. MODULAR HARDPOINT WEAPONS  (Rocket / Arc / Rail / Flak / Torpedo)
// ═══════════════════════════════════════════════════════════════════════════

export const ARC_BEAM_BASE_DAMAGE = 9;
export const ARC_BEAM_BASE_FIRE_RATE = 10;
export const ARC_BEAM_BASE_RANGE = 95;
export const ARC_BEAM_BASE_ARMOR_PIERCE = 0.08;
export const ARC_BEAM_BASE_CRIT_CHANCE = 0.06;
export const ARC_BEAM_BASE_CRIT_MULT = 1.9;
export const ARC_BEAM_HEAT_PER_SHOT = 0.11;
export const ARC_BEAM_HEAT_COOL_RATE = 0.42;
export const ARC_BEAM_SHOP_COST_FRAGMENTS = 200;
export const ARC_BEAM_SHOP_MIN_LEVEL = 4;

export const ROCKET_POD_BASE_DAMAGE = 58;
export const ROCKET_POD_BASE_FIRE_RATE = 0.85;
export const ROCKET_POD_BASE_PROJECTILE_SPEED = 36;
export const ROCKET_POD_BASE_RANGE = 95;
export const ROCKET_POD_BASE_SPLASH_RADIUS = 3.1;
export const ROCKET_POD_BASE_SPLASH_FALLOFF = 0.42;
export const ROCKET_POD_BASE_ARMOR_PIERCE = 0.12;
export const ROCKET_POD_BASE_CRIT_CHANCE = 0.05;
export const ROCKET_POD_BASE_CRIT_MULT = 1.85;
export const ROCKET_POD_HEAT_PER_SHOT = 0.2;
export const ROCKET_POD_HEAT_COOL_RATE = 0.26;
export const ROCKET_POD_BURST_SIZE = 2;
export const ROCKET_POD_SHOP_COST_FRAGMENTS = 140;
export const ROCKET_POD_SHOP_MIN_LEVEL = 3;

export const RAILGUN_BASE_DAMAGE = 95;
export const RAILGUN_BASE_FIRE_RATE = 0.55;
export const RAILGUN_BASE_PROJECTILE_SPEED = 180;
export const RAILGUN_BASE_RANGE = 140;
export const RAILGUN_BASE_SPLASH_RADIUS = 0.4;
export const RAILGUN_BASE_SPLASH_FALLOFF = 0.3;
export const RAILGUN_BASE_ARMOR_PIERCE = 0.75;
export const RAILGUN_BASE_CRIT_CHANCE = 0.12;
export const RAILGUN_BASE_CRIT_MULT = 2.1;
export const RAILGUN_HEAT_PER_SHOT = 0.28;
export const RAILGUN_HEAT_COOL_RATE = 0.22;
export const RAILGUN_CHARGE_TIME_SECONDS = 0.55;
export const RAILGUN_BASE_PENETRATION = 1;
export const RAILGUN_SHOP_COST_FRAGMENTS = 560;
export const RAILGUN_SHOP_MIN_LEVEL = 5;

export const FLAK_CANNON_BASE_DAMAGE = 22;
export const FLAK_CANNON_BASE_FIRE_RATE = 3.2;
export const FLAK_CANNON_BASE_PROJECTILE_SPEED = 55;
export const FLAK_CANNON_BASE_RANGE = 70;
export const FLAK_CANNON_BASE_SPLASH_RADIUS = 2.8;
export const FLAK_CANNON_BASE_SPLASH_FALLOFF = 0.55;
export const FLAK_CANNON_BASE_CRIT_CHANCE = 0.06;
export const FLAK_CANNON_BASE_CRIT_MULT = 1.7;
export const FLAK_CANNON_HEAT_PER_SHOT = 0.09;
export const FLAK_CANNON_HEAT_COOL_RATE = 0.32;
export const FLAK_CANNON_BURST_SIZE = 6;
export const FLAK_CANNON_BASE_SPREAD = 0.2;
export const FLAK_CANNON_SHOP_COST_FRAGMENTS = 700;
export const FLAK_CANNON_SHOP_MIN_LEVEL = 6;

export const HEAVY_TORPEDO_BASE_DAMAGE = 220;
export const HEAVY_TORPEDO_BASE_FIRE_RATE = 0.28;
export const HEAVY_TORPEDO_BASE_PROJECTILE_SPEED = 22;
export const HEAVY_TORPEDO_BASE_RANGE = 95;
export const HEAVY_TORPEDO_BASE_SPLASH_RADIUS = 3.6;
export const HEAVY_TORPEDO_BASE_SPLASH_FALLOFF = 0.4;
export const HEAVY_TORPEDO_BASE_ARMOR_PIERCE = 0.55;
export const HEAVY_TORPEDO_BASE_CRIT_CHANCE = 0.1;
export const HEAVY_TORPEDO_BASE_CRIT_MULT = 2.0;
export const HEAVY_TORPEDO_HEAT_PER_SHOT = 0.45;
export const HEAVY_TORPEDO_HEAT_COOL_RATE = 0.18;
export const HEAVY_TORPEDO_CHARGE_TIME_SECONDS = 0.9;
export const HEAVY_TORPEDO_HOMING_STRENGTH = 0.15;
export const HEAVY_TORPEDO_BASE_PENETRATION = 2;
export const HEAVY_TORPEDO_SHOP_COST_FRAGMENTS = 950;
export const HEAVY_TORPEDO_SHOP_MIN_LEVEL = 8;

/** Hardpoint bay Core Energy costs (HP0 free). */
export const HARDPOINT_BETA_UNLOCK_COST_CORE = 160;
export const HARDPOINT_GAMMA_UNLOCK_COST_CORE = 480;
export const HARDPOINT_BETA_ASCENSION_GATE = 1;
export const HARDPOINT_GAMMA_ASCENSION_GATE = 2;
export const HARDPOINTS_STARTING_UNLOCKED = 1;
export const HARDPOINTS_MAXIMUM = 3;

/** Weapon-stat composition ceilings (after branch ranks). */
export const WEAPON_COMPOSED_ARMOR_PIERCE_CAP = 0.95;
export const WEAPON_COMPOSED_CRIT_CHANCE_CAP = 0.45;
export const WEAPON_COMPOSED_CRIT_MULT_CAP = 2.4;
export const WEAPON_MINIMUM_HEAT_COOL_RATE = 0.05;
export const WEAPON_MINIMUM_FIRE_RATE = 0.15;

// ═══════════════════════════════════════════════════════════════════════════
// 5. SHIP VITALS + ORBIT
// ═══════════════════════════════════════════════════════════════════════════

export const SHIP_BASE_HULL_HIT_POINTS = 100;
export const SHIP_BASE_MAX_HULL = 100;
export const SHIP_BASE_SHIELD = 40;
export const SHIP_BASE_MAX_SHIELD = 40;
export const SHIP_BASE_ARMOR_RATING = 0;
export const SHIP_SHIELD_RECHARGE_DELAY_SECONDS = 3;
export const SHIP_SHIELD_RECHARGE_PER_SECOND = 6;

/** World Y of the arena deck (GridVoid root sits here; pad is local 0). */
export const ARENA_FLOOR_WORLD_Y = -22;
/** Ship / camera must stay this far above the deck. */
export const SHIP_FLOOR_CLEARANCE = 2.4;

/** Sky wash — brighter so Standard cube/ship read after combat lights were cut. */
export const LIGHTING_AMBIENT_COLOR = 0x4a88aa;
export const LIGHTING_AMBIENT_INTENSITY = 1.22;
export const LIGHTING_HEMI_SKY_COLOR = 0xa8d8f0;
export const LIGHTING_HEMI_GROUND_COLOR = 0x1a1420;
export const LIGHTING_HEMI_INTENSITY = 1.28;
export const LIGHTING_KEY_COLOR = 0xeef8ff;
export const LIGHTING_KEY_INTENSITY = 1.55;
export const LIGHTING_RIM_COLOR = 0xc070e0;
export const LIGHTING_RIM_INTENSITY = 0.62;
export const CUBE_LATENT_EMISSIVE_INTENSITY = 0.18;

// ═══════════════════════════════════════════════════════════════════════════
// GROUND STATIONS (4-pad square, searchlights always on, weapons like drones)
// ═══════════════════════════════════════════════════════════════════════════

export const GROUND_STATION_COUNT = 4;
export const GROUND_STATION_RING_RADIUS = 38;
export const GROUND_STATION_PAD_HEIGHT = 0.45;
/** Candela — high so ACES still reads a moving disc on the cube. */
export const GROUND_SEARCHLIGHT_INTENSITY = 145;
export const GROUND_SEARCHLIGHT_DISTANCE = 120;
/** Tight theatrical cone (~10°). */
export const GROUND_SEARCHLIGHT_ANGLE = 0.17;
export const GROUND_SEARCHLIGHT_PENUMBRA = 0.42;
export const GROUND_SEARCHLIGHT_DECAY = 1.05;
export const GROUND_SEARCHLIGHT_COLOR = 0xfff3c8;
export const GROUND_SEARCHLIGHT_RETARGET_MIN_SECONDS = 1.15;
export const GROUND_SEARCHLIGHT_RETARGET_MAX_SECONDS = 3.6;
export const GROUND_SEARCHLIGHT_SLEW_MIN = 0.45;
export const GROUND_SEARCHLIGHT_SLEW_MAX = 2.4;

export const GROUND_SAM_UNLOCK_COST = 160;
export const GROUND_SAM_UNIT_COST = 120;
export const GROUND_SAM_UNLOCK_LEVEL = 3;
export const GROUND_SAM_DAMAGE = 34;
export const GROUND_SAM_FIRE_RATE = 0.55;
export const GROUND_SAM_SWARM_COUNT = 4;
export const GROUND_SAM_SPEED = 28;
export const GROUND_SAM_HOMING = 4.2;
export const GROUND_SAM_SPLASH = 1.15;
export const GROUND_SAM_LIFE = 4.2;

export const GROUND_ARTILLERY_UNLOCK_COST = 220;
export const GROUND_ARTILLERY_UNIT_COST = 150;
export const GROUND_ARTILLERY_UNLOCK_LEVEL = 5;
export const GROUND_ARTILLERY_DAMAGE = 96;
export const GROUND_ARTILLERY_FIRE_RATE = 0.22;
export const GROUND_ARTILLERY_SPEED = 22;
export const GROUND_ARTILLERY_SPLASH = 3.4;
export const GROUND_ARTILLERY_ARC_GRAVITY = 18;
export const GROUND_ARTILLERY_LIFE = 5.5;

export const GROUND_CIWS_UNLOCK_COST = 180;
export const GROUND_CIWS_UNIT_COST = 130;
export const GROUND_CIWS_UNLOCK_LEVEL = 4;
export const GROUND_CIWS_DAMAGE = 7;
export const GROUND_CIWS_FIRE_RATE = 16;
export const GROUND_CIWS_BURST = 8;
export const GROUND_CIWS_SPREAD = 0.28;
export const GROUND_CIWS_SPEED = 95;
export const GROUND_CIWS_LIFE = 1.15;

export const GROUND_WEAPON_UPGRADE_BASE_COST = 140;
export const GROUND_WEAPON_UPGRADE_COST_GROWTH = 1.52;
export const GROUND_WEAPON_UPGRADE_MAX_RANK = 30;
export const GROUND_WEAPON_UPGRADE_DAMAGE_PER_RANK = 0.16;
export const GROUND_WEAPON_UPGRADE_RATE_PER_RANK = 0.1;

export const ORBIT_DEFAULT_RADIUS = 18;
export const ORBIT_MINIMUM_RADIUS = 10;
export const ORBIT_MAXIMUM_RADIUS = 80;
export const ORBIT_MINIMUM_PITCH = -Math.PI / 2 + 0.04;
export const ORBIT_MAXIMUM_PITCH = Math.PI / 2 - 0.04;
export const ORBIT_YAW_SPEED = 0.55;
export const ORBIT_PITCH_SPEED = 0.48;
export const ORBIT_ANGULAR_ACCEL = 1.8;
export const ORBIT_ANGULAR_FRICTION = 4.2;
export const ORBIT_INPUT_SMOOTH = 7;
export const ORBIT_ZOOM_SPEED = 0.05;
export const ORBIT_CAMERA_LAG = 3.0;
export const ORBIT_CAMERA_BACK = 4.2;
export const ORBIT_CAMERA_HEIGHT = 1.65;
export const ORBIT_CAMERA_SIDE = 0.05;
export const ORBIT_CAMERA_SWAY = 0.55;
export const ORBIT_CAMERA_SWAY_LAG = 5.5;
export const ORBIT_SHIP_POSITION_LAG = 5.0;
export const ORBIT_SHIP_ROTATION_LAG = 4.0;
export const ORBIT_INTRO_DURATION_SECONDS = 3.6;
export const ORBIT_INTRO_RADIUS_MULTIPLIER = 1.65;

// ═══════════════════════════════════════════════════════════════════════════
// 6. NUCLEUS HITBOX + CORE COMBAT
//     The living core is an isotropic sphere. Hits from every orbit angle
//     must be equally reliable — no “only from above” dead zone.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interior hit-sphere vs cube half-extent. Must stay inside the outer voxel
 * layer so an intact hull still blocks; large enough that a shaft from any
 * axis presents the same disc.
 */
export const NUCLEUS_HITBOX_FRACTION_OF_CUBE_HALF_EXTENT = 0.48;

/** Floor so tiny tutorial cubes stay easy to tag. */
export const NUCLEUS_HITBOX_MINIMUM_FRACTION_OF_CUBE_HALF_EXTENT = 0.34;

/** Extra world padding after max(visual, cube-fraction). */
export const NUCLEUS_HITBOX_PADDING_WORLD = 0.18;

/** Never closer to the outer face than this (keeps an intact hull solid). */
export const NUCLEUS_HITBOX_OUTER_HULL_CLEARANCE = 0.55;

/** Visual body radius multiplier used only as a lower bound. */
export const NUCLEUS_VISUAL_BODY_RADIUS_MULTIPLIER = 1.08;

/** Ignore fire/pain pulse scale so the core does not magnetize shots. */
export const NUCLEUS_HITBOX_VISUAL_SCALE = 1.12;

/** Tendril reach (visual only — not used to grow the hitbox). */
export const NUCLEUS_VISUAL_TENDRIL_RADIUS_MULTIPLIER = 1.55;

/** Visual nucleus scale vs cube half-extent. */
export const NUCLEUS_VISUAL_BASE_SCALE_FRACTION_OF_HALF_EXTENT = 0.2;
export const NUCLEUS_VISUAL_BASE_SCALE_MINIMUM = 0.62;

/** Swept-sphere extra pad. Must stay well inside OUTER_HULL_CLEARANCE. */
export const NUCLEUS_PROJECTILE_SWEPT_PADDING = 0.12;

/** True voxel wins if it is at least this much closer than the sphere. */
export const NUCLEUS_SHELL_OCCLUSION_EPSILON = 0;

/** True (non-forgiving) block half-size — matches BLOCK_SIZE / 2. */
export const BLOCK_TRUE_HALF_EXTENT = 0.5;

/** Default forgiving block half-extent for generic raycasts. */
export const BLOCK_FORGIVING_HALF_EXTENT = 0.52;

export const NUCLEUS_MAX_SHELL_DAMAGE_REDUCTION = 0.88;
export const NUCLEUS_MIN_DAMAGE_THROUGHPUT = 0.12;
export const NUCLEUS_DAMAGE_TRANSFER_TO_SHELL_FRACTION = 0.1;
export const NUCLEUS_EXPOSED_SHELL_RATIO = 0.1;
export const NUCLEUS_DECAY_PER_SECOND_OF_MAX = 0.018;
export const NUCLEUS_DECAY_MINIMUM_PER_SECOND = 6;
export const NUCLEUS_OVERLOAD_THRESHOLDS = [0.75, 0.5, 0.25] as const;

export const NUCLEUS_SPIKE_TELEGRAPH_SECONDS = 1.45;
export const NUCLEUS_SPIKE_OMNI_COUNT = 10;
export const NUCLEUS_SPIKE_SPEED = 10.5;
export const NUCLEUS_SPIKE_DAMAGE = 16;
export const NUCLEUS_SPIKE_HIT_RADIUS = 0.92;
export const NUCLEUS_SPIKE_LIFETIME_SECONDS = 5.2;
export const NUCLEUS_SPIKE_SHOCK_RADIUS = 11;
export const NUCLEUS_SPIKE_SHOCK_DAMAGE = 14;
export const NUCLEUS_SPIKE_SHOCK_DURATION = 0.4;

// ── Nucleus ATK power (stage lethality / cool-factor) ──
/** Linear ATK growth per stage after 1. */
export const NUCLEUS_ATK_POWER_MULTIPLIER_PER_STAGE = 0.055;
/** Extra super-linear ATK so late beacons stay threatening. */
export const NUCLEUS_ATK_POWER_MULTIPLIER_ACCEL = 0.008;
/**
 * Global difficulty knob applied on top of the stage curve.
 * 1 = baseline. Raise to make every nucleus toy hit harder / more often.
 */
export const NUCLEUS_ATK_DIFFICULTY_MULTIPLIER = 1;

export const NUCLEUS_BLOB_UNLOCK_STAGE = 10;
export const NUCLEUS_KAMIKAZE_UNLOCK_STAGE = 20;
export const NUCLEUS_MINE_UNLOCK_STAGE = 30;
export const NUCLEUS_GRAVITY_WELL_UNLOCK_STAGE = 40;
export const NUCLEUS_MIRROR_SHARD_UNLOCK_STAGE = 50;
export const NUCLEUS_PHASE_RIFT_UNLOCK_STAGE = 60;
export const NUCLEUS_STATIC_BLOOM_UNLOCK_STAGE = 70;
export const NUCLEUS_LATTICE_JAVELIN_UNLOCK_STAGE = 80;

export const NUCLEUS_BLOB_COOLDOWN_SECONDS = 7.2;
export const NUCLEUS_BLOB_DAMAGE = 8;
export const NUCLEUS_BLOB_SPEED = 11;
export const NUCLEUS_BLOB_RADIUS = 1.05;
export const NUCLEUS_BLOB_LIFE_SECONDS = 6.5;
export const NUCLEUS_BLOB_HIT_POINTS = 18;
export const NUCLEUS_BLOB_OVERLOAD_COUNT = 4;
export const NUCLEUS_BLOB_OVERLOAD_SPREAD = 0.32;

export const NUCLEUS_KAMIKAZE_BASE_COUNT = 2;
export const NUCLEUS_KAMIKAZE_BASE_HIT_POINTS = 18;
export const NUCLEUS_KAMIKAZE_HIT_POINTS_PER_STAGE = 1.55;
export const NUCLEUS_KAMIKAZE_DAMAGE = 14;
export const NUCLEUS_KAMIKAZE_SPEED = 7.2;
export const NUCLEUS_KAMIKAZE_PROXIMITY = 1.45;

export const NUCLEUS_MINE_COOLDOWN_SECONDS = 16;
export const NUCLEUS_MINE_MAX_LIVE = 3;
export const NUCLEUS_MINE_HIT_POINTS = 22;
export const NUCLEUS_MINE_PROXIMITY = 2.85;
export const NUCLEUS_MINE_FUSE_SECONDS = 8.5;
export const NUCLEUS_MINE_BLAST_DAMAGE = 12;
export const NUCLEUS_MINE_BLAST_RADIUS = 3.2;
export const NUCLEUS_MINE_SHRAPNEL_COUNT = 8;
export const NUCLEUS_MINE_SHRAPNEL_DAMAGE = 6;
export const NUCLEUS_MINE_SHRAPNEL_SPEED = 16;

export const NUCLEUS_GRAVITY_COOLDOWN_SECONDS = 16;
export const NUCLEUS_GRAVITY_DURATION_SECONDS = 2.1;
export const NUCLEUS_GRAVITY_YAW_STRENGTH = 0.22;
export const NUCLEUS_GRAVITY_CORE_DAMAGE = 4;

export const NUCLEUS_SHARD_COOLDOWN_SECONDS = 20;
export const NUCLEUS_SHARD_COUNT = 2;
export const NUCLEUS_SHARD_HITS = 3;
export const NUCLEUS_SHARD_ORBIT_RADIUS = 6.5;
export const NUCLEUS_SHARD_LIFE_SECONDS = 12;

export const NUCLEUS_RIFT_COOLDOWN_SECONDS = 18;
export const NUCLEUS_RIFT_TELEGRAPH_SECONDS = 1.35;
export const NUCLEUS_RIFT_FIRE_SECONDS = 0.7;
export const NUCLEUS_RIFT_DAMAGE_PER_SECOND = 18;
export const NUCLEUS_RIFT_HIT_RADIUS = 1.05;

export const NUCLEUS_BLOOM_COOLDOWN_SECONDS = 15;
export const NUCLEUS_BLOOM_DURATION_SECONDS = 1.15;

export const NUCLEUS_JAVELIN_COOLDOWN_SECONDS = 16;
export const NUCLEUS_JAVELIN_TELEGRAPH_SECONDS = 1.55;
export const NUCLEUS_JAVELIN_DAMAGE = 22;
export const NUCLEUS_JAVELIN_SPEED = 28;
export const NUCLEUS_JAVELIN_HIT_POINTS = 20;

/** Master nucleus ATK power vs stage. Also in `nucleusAtk.ts` as the named API. */
export function nucleusAtkPowerMultiplier(
  stage: number,
  difficultyMul: number = NUCLEUS_ATK_DIFFICULTY_MULTIPLIER
): number {
  const s = Math.max(1, stage);
  const linear = 1 + (s - 1) * NUCLEUS_ATK_POWER_MULTIPLIER_PER_STAGE;
  const accel = Math.pow(Math.max(0, s - 1), 1.12) * NUCLEUS_ATK_POWER_MULTIPLIER_ACCEL;
  return Math.max(1, (linear + accel) * Math.max(0.25, difficultyMul));
}

export const NUCLEUS_RAGE_FIRE_RATE_MULTIPLIER = 1.35;
export const NUCLEUS_RAGE_ARC_COOLDOWN_SECONDS = 4.2;
export const NUCLEUS_RAGE_OVERLOAD_DURATION_SECONDS = 3.2;
export const NUCLEUS_RAGE_OVERLOAD_BEAM_COUNT = 8;
export const NUCLEUS_ARC_BEAM_SPEED = 12;
export const NUCLEUS_ARC_BEAM_DAMAGE = 22;

export const NUCLEUS_RAGE_LASER_CHARGE_SECONDS = 2.4;
export const NUCLEUS_RAGE_LASER_DURATION_SECONDS = 5.0;
export const NUCLEUS_RAGE_LASER_COOLDOWN_SECONDS = 3.8;
export const NUCLEUS_RAGE_LASER_WARMUP_SECONDS = 0.7;
export const NUCLEUS_RAGE_LASER_SLEW_WHILE_CHARGING = 0.2;
export const NUCLEUS_RAGE_LASER_SLEW_WHILE_FIRING = 0.3;
export const NUCLEUS_RAGE_LASER_SLEW_WHILE_OVERLOAD = 0.42;
export const NUCLEUS_RAGE_LASER_RANGE = 78;
export const NUCLEUS_RAGE_LASER_HIT_RADIUS = 1.18;
export const NUCLEUS_RAGE_LASER_DPS = 16;
export const NUCLEUS_RAGE_LASER_OVERLOAD_DPS = 20;

export const NUCLEUS_REGEN_SHELL_HEAL_PER_SECOND = 0.008;
export const NUCLEUS_REGEN_REPAIR_DRONE_COUNT = 4;
export const NUCLEUS_REGEN_RESURRECT_FRACTION_MIN = 0.05;
export const NUCLEUS_REGEN_RESURRECT_FRACTION_MAX = 0.1;
export const NUCLEUS_REGEN_REVIVE_PER_SECOND_OF_DEAD = 0.012;
export const NUCLEUS_REGEN_OVERLOAD_TIMER_SECONDS = 2.5;

export const NUCLEUS_SWARM_SPAWN_INTERVAL_SECONDS = 5.5;
export const NUCLEUS_SWARM_EXPOSED_BURST_COUNT = 6;
export const NUCLEUS_SWARM_ENRAGE_DURATION_SECONDS = 5;
export const NUCLEUS_SWARM_ENRAGE_SPEED_MULTIPLIER = 1.55;
export const NUCLEUS_SWARM_ENRAGE_FIRE_MULTIPLIER = 1.7;

/** HP formula: (avgHP × A + level × B + C) × volumeFactor. */
export const NUCLEUS_MAX_HP_AVG_HP_WEIGHT = 55;
export const NUCLEUS_MAX_HP_LEVEL_WEIGHT = 180;
export const NUCLEUS_MAX_HP_FLAT = 400;
export const NUCLEUS_MAX_HP_VOLUME_SIZE_OFFSET = 6;
export const NUCLEUS_MAX_HP_VOLUME_EXPONENT = 1.1;
export const NUCLEUS_MAX_HP_VOLUME_WEIGHT = 0.08;

/** Combat progress mix: shell vs nucleus. */
export const NUCLEUS_PROGRESS_SHELL_WEIGHT = 0.85;
export const NUCLEUS_PROGRESS_CORE_WEIGHT = 0.15;

/**
 * World-space isotropic hit radius. Same value on every approach angle.
 * Capped so an intact outer layer always sits in front of the sphere.
 */
export function nucleusHitRadiusWorld(
  cubeHalfExtent: number,
  visualBaseScale: number
): number {
  const he = Math.max(0.01, cubeHalfExtent);
  const visual =
    visualBaseScale * NUCLEUS_VISUAL_BODY_RADIUS_MULTIPLIER * NUCLEUS_HITBOX_VISUAL_SCALE;
  const fromCube = he * NUCLEUS_HITBOX_FRACTION_OF_CUBE_HALF_EXTENT;
  const floor = he * NUCLEUS_HITBOX_MINIMUM_FRACTION_OF_CUBE_HALF_EXTENT;
  const raw = Math.max(floor, fromCube, visual) + NUCLEUS_HITBOX_PADDING_WORLD;
  const cap = Math.max(0.75, he - NUCLEUS_HITBOX_OUTER_HULL_CLEARANCE);
  return Math.min(cap, raw);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. CUBE DEFENSE  (enemy drones, turrets, intercepts)
// ═══════════════════════════════════════════════════════════════════════════

export const ENEMY_DRONE_SOFT_CAP = 18;
export const ENEMY_ATTACK_DRONE_BASE_HIT_POINTS = 40;
export const ENEMY_ATTACK_DRONE_HIT_POINTS_PER_LEVEL = 5;
export const ENEMY_REPAIR_DRONE_BASE_HIT_POINTS = 28;
export const ENEMY_REPAIR_DRONE_HIT_POINTS_PER_LEVEL = 3;
export const ENEMY_DRONE_BASE_DAMAGE = 6;
export const ENEMY_DRONE_DAMAGE_PER_LEVEL = 0.55;
export const ENEMY_DRONE_ELITE_FIRE_RATE_MULTIPLIER = 1.35;
export const ENEMY_ATTACK_DRONE_SPEED = 6.5;
export const ENEMY_REPAIR_DRONE_SPEED = 4.5;
export const ENEMY_DRONE_REPAIR_FRACTION = 0.07;
export const ENEMY_DRONE_DEFAULT_HIT_POINTS = 45;
export const ENEMY_DRONE_DEFAULT_DAMAGE = 8;
export const ENEMY_DRONE_DEFAULT_FIRE_RATE = 1.1;
export const ENEMY_DRONE_DEFAULT_SPEED = 6;
export const ENEMY_DRONE_DEFAULT_RANGE = 28;
export const ENEMY_DRONE_DEFAULT_REPAIR_FRACTION = 0.06;

export const LATTICE_TURRET_BASE_HIT_POINTS = 55;
export const LATTICE_TURRET_HIT_POINTS_PER_LEVEL = 14;
export const LATTICE_TURRET_BASE_DAMAGE = 9;
export const LATTICE_TURRET_DAMAGE_PER_LEVEL = 0.85;
export const LATTICE_TURRET_FIRE_RATE = 0.45;
export const LATTICE_TURRET_ELITE_FIRE_RATE = 0.7;
export const LATTICE_TURRET_BASE_PROJECTILE_SPEED = 16;
export const LATTICE_TURRET_PROJECTILE_SPEED_PER_LEVEL = 0.35;

export const FLOATING_TURRET_BASE_HIT_POINTS = 70;
export const FLOATING_TURRET_HIT_POINTS_PER_LEVEL = 16;
export const FLOATING_TURRET_BASE_DAMAGE = 10;
export const FLOATING_TURRET_DAMAGE_PER_LEVEL = 0.8;
export const FLOATING_TURRET_FIRE_RATE = 0.4;
export const FLOATING_TURRET_PROJECTILE_SPEED = 16;

export const TURRET_DEFAULT_HIT_POINTS = 80;
export const TURRET_DEFAULT_DAMAGE = 12;
export const TURRET_DEFAULT_FIRE_RATE = 0.45;
export const TURRET_DEFAULT_PROJECTILE_SPEED = 18;
export const TURRET_DEFAULT_RANGE = 55;

export const ENEMY_WEAPON_TARGET_RADIUS_DRONE = 1.15;
export const ENEMY_WEAPON_TARGET_RADIUS_TURRET = 1.05;
export const ENEMY_INTERCEPT_RADIUS = 0.9;
export const ENEMY_ARC_DEFAULT_HIT_POINTS = 28;

// ═══════════════════════════════════════════════════════════════════════════
// 8. ARMOR / CRIT / STAT CAPS
// ═══════════════════════════════════════════════════════════════════════════

export const ARMOR_HYPERBOLIC_K = 100;
export const ARMOR_MAX_EFFECTIVE_REDUCTION = 0.55;

export const CRIT_CHANCE_HARD_CAP = 0.4;
export const CRIT_MULT_HARD_CAP = 2.25;
export const FIRE_RATE_MULTIPLIER_HARD_CAP = 2.75;
export const ORBIT_SPEED_MULTIPLIER_HARD_CAP = 1.85;
export const FRAGMENT_MULTIPLIER_HARD_CAP = 2.25;

export const TECH_DAMAGE_MULTIPLIER_CAP = 5.0;
export const TECH_FIRE_RATE_MULTIPLIER_CAP = 3.0;
export const TECH_ORBIT_SPEED_MULTIPLIER_CAP = 1.95;
export const TECH_FRAGMENT_MULTIPLIER_CAP = 1.75;
export const TECH_CORE_ENERGY_MULTIPLIER_CAP = 2.5;
export const TECH_CRIT_CHANCE_CAP = 0.45;
export const TECH_CRIT_MULT_CAP = 2.4;

export const ARMOR_RATING_SIEGE = 180;
export const ARMOR_RATING_HEAVY = 90;
export const ARMOR_RATING_LIGHT = 35;

export const IDLE_ARMOR_DAMAGE_NONE = 1;
export const IDLE_ARMOR_DAMAGE_LIGHT = 0.45;
export const IDLE_ARMOR_DAMAGE_HEAVY = 0.1;
export const IDLE_ARMOR_DAMAGE_SIEGE = 0.05;

export const BLOCK_REINFORCED_HP_MULTIPLIER = 2.2;
export const BLOCK_REGENERATING_HP_MULTIPLIER = 1.3;
export const BLOCK_EXPLOSIVE_HP_MULTIPLIER = 0.9;
export const BLOCK_DATA_NODE_HP_MULTIPLIER = 1.1;
export const BLOCK_SIEGE_HP_MULTIPLIER = 3.5;
export const BLOCK_TURRET_HP_MULTIPLIER = 2.4;
export const BLOCK_REINFORCED_FRAGMENT_MULTIPLIER = 1.4;
export const BLOCK_REGENERATING_FRAGMENT_MULTIPLIER = 1.2;
export const BLOCK_EXPLOSIVE_FRAGMENT_MULTIPLIER = 1.1;
export const BLOCK_DATA_NODE_FRAGMENT_MULTIPLIER = 4;
export const BLOCK_CORE_FRAGMENT_MULTIPLIER = 8;
export const BLOCK_SIEGE_FRAGMENT_MULTIPLIER = 1.8;
export const BLOCK_TURRET_FRAGMENT_MULTIPLIER = 2.2;

// ═══════════════════════════════════════════════════════════════════════════
// 9. LEVEL SCALING / DIFFICULTY
// ═══════════════════════════════════════════════════════════════════════════

export const LEVEL_HP_SCALE_LINEAR = 0.12;
export const LEVEL_HP_SCALE_POWER = 1.55;
export const LEVEL_HP_SCALE_POWER_WEIGHT = 0.018;

export const LEVEL_REWARD_SCALE_POWER = 0.72;
export const LEVEL_REWARD_SCALE_WEIGHT = 0.28;

export const LEVEL_DEFAULT_FRAG_BASE = 28;
export const LEVEL_DEFAULT_FRAG_SQRT_WEIGHT = 0.35;
export const LEVEL_DEFAULT_FRAG_PER_ID = 5.5;
export const LEVEL_DEFAULT_FRAG_GLOBAL_SCALE = 0.55;

export const LEVEL_DEFAULT_CORE_ENERGY_BASE = 8;
export const LEVEL_DEFAULT_CORE_ENERGY_PER_ID = 3;
export const LEVEL_DEFAULT_CORE_ENERGY_MIDGAME_BONUS = 12;
export const LEVEL_DEFAULT_CORE_ENERGY_MIDGAME_FROM_ID = 5;

export const LEVEL_DEFAULT_CORE_HP_AVG_WEIGHT = 55;
export const LEVEL_DEFAULT_CORE_HP_PER_ID = 180;
export const LEVEL_DEFAULT_CORE_HP_FLAT = 400;

export const DEFENSE_NONE_MAX_LEVEL = 4;
export const DEFENSE_SHIELD_MIN_LEVEL = 5;
export const DEFENSE_SHIELD_MAX_LEVEL = 7;
export const DEFENSE_TURRET_MIN_LEVEL = 8;
export const DEFENSE_TURRET_MAX_LEVEL = 10;
export const DEFENSE_FACE_MIN_LEVEL = 11;
export const DEFENSE_FACE_MAX_LEVEL = 14;
export const DEFENSE_DRONES_MIN_LEVEL = 15;
export const DEFENSE_DRONES_MAX_LEVEL = 18;
export const DEFENSE_ELITE_MIN_LEVEL = 19;
export const DEFENSE_ADAPTIVE_MIN_LEVEL = 26;
export const INTRO_LEVEL_MAXIMUM = 3;

// ═══════════════════════════════════════════════════════════════════════════
// 10. ECONOMY / EVOLVE / RESEARCH
// ═══════════════════════════════════════════════════════════════════════════

export const CURRENCY_FRAGMENTS_PER_BLOCK = 1;
export const CURRENCY_CORE_CLEAR_BASE = 25;

export const EVOLVE_COST_PER_TIER = 100_000;
export const EVOLVE_MIN_LEVEL_BASE = 8;
export const EVOLVE_MIN_LEVEL_PER_ASCENSION = 3;
/** Every Nth sector is a Chronobeacon checkpoint. */
export const CHRONOBEACON_INTERVAL = 5;
/** After Evolve the run restarts at this Chronobeacon. */
export const EVOLVE_RESET_LEVEL = 5;
/** Repeatable shop ranks unlocked per evolution (Evo 0 = 10, Evo 1 = 20…). */
export const REPEATABLE_UPGRADE_CAP_PER_EVOLUTION = 10;
/** Generated catalog length so later evolutions have ranks to buy. */
export const REPEATABLE_UPGRADE_GENERATED_RANKS = 100;
export const EVOLVE_CORE_GRANT_BASE = 100;
export const EVOLVE_CORE_GRANT_PER_TIER = 60;
export const EVOLVE_UI_PREVIEW_RATIO = 0.5;
export const EVOLVE_FRAGMENTS_PER_CORE = 1000;
export const EVOLVE_BASELINE_DAMAGE_SOFT_CAP = 1.8;

export const EVOLVE_TIER_1_2_DAMAGE_MULTIPLIER = 1.08;
export const EVOLVE_TIER_1_2_HULL_MULTIPLIER = 1.1;
export const EVOLVE_TIER_1_2_SHIELD_MULTIPLIER = 1.1;
export const EVOLVE_TIER_1_2_DRONE_DAMAGE_MULTIPLIER = 1.08;
export const EVOLVE_TIER_1_2_ORBIT_SPEED_MULTIPLIER = 1.04;
export const EVOLVE_TIER_1_2_IDLE_RATE_MULTIPLIER = 1.05;

export const EVOLVE_TIER_3_PLUS_DAMAGE_MULTIPLIER = 1.07;
export const EVOLVE_TIER_3_PLUS_HULL_MULTIPLIER = 1.08;
export const EVOLVE_TIER_3_PLUS_SHIELD_MULTIPLIER = 1.08;
export const EVOLVE_TIER_3_PLUS_DRONE_DAMAGE_MULTIPLIER = 1.07;
export const EVOLVE_TIER_3_PLUS_ORBIT_SPEED_MULTIPLIER = 1.03;
export const EVOLVE_TIER_3_PLUS_IDLE_RATE_MULTIPLIER = 1.04;

export const RESEARCH_DEFAULT_COST_GROWTH = 1.085;
export const RESEARCH_STACKABLE_MAX_RANK = 100;
export const AD_CORE_ENERGY_REWARD = 12;

export const RESEARCH_LATTICE_FOCUS_COST = 12;
export const RESEARCH_HULL_WEAVE_COST = 10;
export const RESEARCH_DATA_SIPHON_COST = 14;
export const RESEARCH_IDLE_LATTICE_COST = 11;
export const RESEARCH_TRAIL_CYAN_COST = 15;
export const RESEARCH_SWARM_PROTOCOL_COST = 18;
export const RESEARCH_BARRIER_MESH_COST = 16;
export const RESEARCH_THRUSTER_LATTICE_COST = 20;
export const RESEARCH_OVERSHIELD_COST = 120;
export const RESEARCH_IFF_BUFFER_COST = 40;
export const RESEARCH_CRITICAL_WEAVE_COST = 28;
export const RESEARCH_COMPOSITE_SKIN_COST = 160;
export const RESEARCH_SCAN_PULSE_COST = 220;
export const RESEARCH_AUTO_COLLECT_COST = 200;
export const RESEARCH_DEEP_FRAME_COST = 180;
export const RESEARCH_AUTHORITY_CORE_COST = 400;

export const RESEARCH_LATTICE_FOCUS_DAMAGE_MULTIPLIER = 1.015;
export const RESEARCH_HULL_WEAVE_HULL_MULTIPLIER = 1.012;
export const RESEARCH_DATA_SIPHON_FRAGMENT_MULTIPLIER = 1.015;
export const RESEARCH_IDLE_LATTICE_RATE_MULTIPLIER = 1.02;
export const RESEARCH_SWARM_PROTOCOL_DRONE_DAMAGE_MULTIPLIER = 1.015;
export const RESEARCH_BARRIER_MESH_SHIELD_MULTIPLIER = 1.015;
export const RESEARCH_THRUSTER_LATTICE_ORBIT_MULTIPLIER = 1.008;
export const RESEARCH_IFF_BUFFER_IMMUNITY_BONUS_SECONDS = 1.5;
export const RESEARCH_CRITICAL_WEAVE_CRIT_ADD = 0.0015;
export const RESEARCH_COMPOSITE_SKIN_ARMOR_ADD = 8;
export const RESEARCH_DEEP_FRAME_HULL_ADD = 25;
export const RESEARCH_AUTHORITY_CORE_MULTIPLIER = 1.05;

// ═══════════════════════════════════════════════════════════════════════════
// 11. IDLE / AFK
// ═══════════════════════════════════════════════════════════════════════════

export const IDLE_MAX_OFFLINE_SECONDS = 8 * 60 * 60;
export const IDLE_BASE_CLEAR_RATE = 0.15;
export const IDLE_SOFT_HEAT_REGEN = 0.35;

// ═══════════════════════════════════════════════════════════════════════════
// 12. PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

export const PERFORMANCE_TARGET_FPS = 50;
export const PERFORMANCE_LOW_FPS_THRESHOLD = 32;
export const PERFORMANCE_LOW_FPS_SECONDS_BEFORE_DEMOTE = 1.1;
export const PERFORMANCE_MAX_PARTICLES = 640;
export const PERFORMANCE_LOW_MAX_PARTICLES = 160;
export const PERFORMANCE_MAX_PROJECTILES = 40;
export const PERFORMANCE_INSTANCE_REBUILD_BUDGET_MS = 4;

/** Combat / intro presentation cap. 120 Hz phones were melting at uncapped rAF. */
export const PERFORMANCE_FRAME_CAP_HZ = 60;
/** Overlay menus (shop / research / levels) when the 3D view is frozen or idle. */
export const PERFORMANCE_MENU_FRAME_CAP_HZ = 12;
/**
 * After this many seconds of combat on Medium+, bloom is disabled for the
 * rest of the session (user High/Medium preference is unchanged).
 */
export const PERFORMANCE_COMBAT_BLOOM_GRACE_SECONDS = 60;
/** Cell size for cube raycast spatial hash (world units). */
export const PERFORMANCE_RAYCAST_HASH_CELL_SIZE = 2;

/** Membrane icosahedron subdivision. Was 3; 2 is the same silhouette. */
export const NUCLEUS_MEMBRANE_ICOSAHEDRON_DETAIL = 2;

export const CHUNK_VOXEL_COUNT = 8;
export const BLOCK_WORLD_SIZE = 1;

export const SAVE_SCHEMA_VERSION = 2;
export const SAVE_LOCAL_STORAGE_KEY = 'cube-game-save-v2';
