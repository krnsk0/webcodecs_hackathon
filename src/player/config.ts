// without this the commit phase in profiler is very long
// and the effective framerate drops
export const USE_BITMAP_RENDERER_CANVAS = true;

// should we ask for hw accel when initializing video decoder?
export const REQUEST_HARDWARE_ACCELERATION = true;

// should we pass optimizeForLatency flag when initializing video decoder?
export const OPTIMIZE_FOR_LATENCY_FLAG = true;

// how many ms should we attempt to prebuffer?
export const PREBUFFER_TARGET = 1000;

// how far ahead of the playhead should we buffer?
export const BUFFER_TARGET = 500;

// how many workers to use for frame conversion?
export const FRAME_CONVERSION_WORKERS = 3;

// how many frames behind the playhead should we start purge frames in the buffer?
export const FRAME_PURGE_THRESHOLD = 4;

// how fast to update the visualizations / metrics
export const UI_UPDATE_INTERVAL = 1000;
