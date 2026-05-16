// webOS remote control key codes. Most modern (5.0+) sets emit standard
// keyboard events for the D-pad. The legacy codes (461 = back, 19 = pause,
// etc.) are kept here in case we ever need to handle older firmware.
export const RemoteKey = {
  Up: 38,
  Down: 40,
  Left: 37,
  Right: 39,
  Enter: 13,
  Back: 461,
  BackBackspace: 8,
  Pause: 19,
  Play: 415,
  Stop: 413,
  FastForward: 417,
  Rewind: 412,
  Red: 403,
  Green: 404,
  Yellow: 405,
  Blue: 406,
  ChannelUp: 33,
  ChannelDown: 34,
} as const;

export function isBackKey(e: KeyboardEvent): boolean {
  return e.keyCode === RemoteKey.Back ||
    e.keyCode === RemoteKey.BackBackspace ||
    e.key === "Backspace" ||
    e.key === "GoBack";
}

export function isPlayPauseKey(e: KeyboardEvent): boolean {
  return e.keyCode === RemoteKey.Play ||
    e.keyCode === RemoteKey.Pause ||
    e.key === "MediaPlayPause";
}
