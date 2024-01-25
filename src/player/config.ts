// without this the commit phase in profiler is very long
// and the effective framerate drops
export const USE_BITMAP_RENDERER_CANVAS = true;

// should we ask for hw accel when initializing video decoder?
export const REQUEST_HARDWARE_ACCELERATION = true;

// should we pass optimizeForLatency flag when initializing video decoder?
export const OPTIMIZE_FOR_LATENCY_FLAG = true;

// how many ms should we attempt to prebuffer?
export const PREBUFFER_TARGET = 250;
