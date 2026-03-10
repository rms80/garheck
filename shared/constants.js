// shared/constants.js
export const TICK_RATE = 60;
export const TICK_DURATION = 1000 / TICK_RATE;       // 16.67ms
export const SEND_RATE = 20;
export const SEND_INTERVAL = TICK_RATE / SEND_RATE;  // every 3 ticks
export const SERVER_PORT = 3000;

export const ARENA_RADIUS = 20;
export const ARENA_SIDES = 8;
export const ARENA_WALL_HEIGHT = 4;

export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 2.0;
export const PLAYER_MOVE_SPEED = 8;
export const PLAYER_JUMP_VELOCITY = 12.25;
export const GRAVITY = -25;
export const AIR_CONTROL_FACTOR = 0.6;
export const KNOCKBACK_FRICTION = 8.0;       // per second decay rate for knockback velocity

export const PLAYER_MAX_HP = 100;
export const PUNCH_DAMAGE = 10;
export const PUNCH_WINDUP = 0.05;
export const PUNCH_ACTIVE = 0.1;
export const PUNCH_RECOVERY = 0.15;
export const PUNCH_RANGE = 0.8;
export const PUNCH_HITBOX_RADIUS = 0.5;
export const PUNCH_KNOCKBACK_XZ = 6;
export const PUNCH_KNOCKBACK_Y = 3;
export const PUNCH_HITSTUN = 0.3;

export const STOMP_VELOCITY = -15;
export const STOMP_DAMAGE = 15;
export const STOMP_HITBOX_RADIUS = 0.6;
export const STOMP_KNOCKBACK_XZ = 8;
export const STOMP_HITSTUN = 0.5;
export const STOMP_BOUNCE_VELOCITY = 6;
export const STOMP_MISS_LAG = 0.4;

export const BLOCK_DAMAGE_MULTIPLIER = 0.5;  // 50% damage when blocking
export const BLOCK_KNOCKBACK_MULTIPLIER = 0.25; // 25% knockback when blocking
export const BLOCK_STUN = 0.15;              // block stun duration
export const PARRY_WINDOW = 0.3;             // seconds after block starts where parry is active
export const PARRY_PUNISH_STUN = 0.4;        // hitstun applied to attacker on parry

export const IFRAMES_DURATION = 0.8;

export const ROUND_TIME = 90;
export const ROUNDS_TO_WIN = 2;
export const MAX_DRAWS = 3;                  // max consecutive draws before sudden death
export const COUNTDOWN_SECONDS = 3;
export const BETWEEN_ROUNDS_PAUSE = 2;

export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 100;
export const CAMERA_DEFAULT_DISTANCE = 5;
export const CAMERA_MIN_DISTANCE = 2;
export const CAMERA_MAX_DISTANCE = 10;
export const CAMERA_MIN_PITCH = -Math.PI / 6;  // -30 deg (looking slightly up)
export const CAMERA_MAX_PITCH = Math.PI / 3;    // +60 deg (looking down)

export const SNAP_THRESHOLD = 2.0;
export const LERP_THRESHOLD = 0.1;
export const LERP_FACTOR = 0.1;

export const MAX_INPUT_QUEUE = 10;           // max queued inputs per player per tick
