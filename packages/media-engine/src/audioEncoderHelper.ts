import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export async function encodeAudioBufferToMuxer(
  audioBuffer: AudioBuffer,
  muxer: Muxer<ArrayBufferTarget>
): Promise<void> {
  if (typeof AudioEncoder === 'undefined') return;

  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;

  const support = await AudioEncoder.isConfigSupported({
    codec: 'mp4a.40.2', // AAC-LC
    sampleRate,
    numberOfChannels,
    bitrate: 128_000,
  });

  if (!support.supported) return;

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error('AudioEncoder error:', e),
  });

  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels,
    bitrate: 128_000,
  });

  const totalFrames = audioBuffer.length;
  const chunkFrames = 1024;

  for (let offset = 0; offset < totalFrames; offset += chunkFrames) {
    const frameCount = Math.min(chunkFrames, totalFrames - offset);
    const planarData = new Float32Array(frameCount * numberOfChannels);

    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      planarData.set(channelData.subarray(offset, offset + frameCount), ch * frameCount);
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: frameCount,
      numberOfChannels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: planarData,
    });

    audioEncoder.encode(audioData);
    audioData.close();
  }

  await audioEncoder.flush();
  audioEncoder.close();
}
