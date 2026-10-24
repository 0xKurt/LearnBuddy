// requires live verification in Claude Code session
import { afterEach, describe, expect, it, vi } from 'vitest';
const players = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('expo-audio', () => ({
  createAudioPlayer: players.create,
  setAudioModeAsync: vi.fn(async () => undefined),
}));
vi.mock('../pcmPlayer.js', () => ({ playPcm: vi.fn(() => null) }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
import { playAudio, prepareAudio, releasePlayer } from '../naturalPlayer.js';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('progressive player queue', () => {
  it('prepares sentence two without playing it; plays the same player without another download', () => {
    vi.useFakeTimers();
    const first = {
      play: vi.fn(),
      pause: vi.fn(),
      remove: vi.fn(),
      addListener: vi.fn(() => ({ remove: vi.fn() })),
      currentTime: 0,
      duration: 0,
    };
    const second = { ...first, play: vi.fn(), remove: vi.fn() };
    players.create.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const source = {
      uri: 'https://api.example/v1/voice/speech',
      headers: { authorization: 'Bearer private' },
    };
    const a = prepareAudio(source);
    const b = prepareAudio(source);
    expect(first.play).not.toHaveBeenCalled();
    expect(second.play).not.toHaveBeenCalled();
    const end = vi.fn();
    const handle = playAudio(a, { onStart: vi.fn(), onProgress: vi.fn(), onEnd: end });
    expect(first.play).toHaveBeenCalledOnce();
    expect(second.play).not.toHaveBeenCalled();
    expect(players.create).toHaveBeenCalledTimes(2);
    expect(players.create).toHaveBeenCalledWith(source, {
      updateInterval: 100,
      downloadFirst: false,
    });
    releasePlayer(b);
    handle.stop();
    releasePlayer(a);
    expect(second.remove).toHaveBeenCalledOnce();
    expect(first.remove).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledWith('stopped');
  });
  it('does not mistake the growing stream duration for EOF', () => {
    vi.useFakeTimers();
    const player = {
      play: vi.fn(),
      pause: vi.fn(),
      remove: vi.fn(),
      addListener: vi.fn(() => ({ remove: vi.fn() })),
      currentTime: 0.99,
      duration: 1,
    };
    players.create.mockReturnValue(player);
    const end = vi.fn();
    const handle = playAudio(prepareAudio({ uri: 'https://api.example/stream' }), {
      onStart: vi.fn(),
      onProgress: vi.fn(),
      onEnd: end,
    });
    vi.advanceTimersByTime(100);
    expect(end).not.toHaveBeenCalled();
    handle.stop();
  });
});
