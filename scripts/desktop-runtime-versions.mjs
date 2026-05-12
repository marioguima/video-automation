export const DESKTOP_RUNTIME_DEFAULTS = {
  ffmpegArchiveName: "ffmpeg-master-latest-win64-gpl.zip",
  ffmpegUrl:
    process.env.FLOWSHOPY_FFMPEG_URL?.trim() ||
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
  pythonVersion: process.env.FLOWSHOPY_PYTHON_VERSION?.trim() || "3.13.13",
  get pythonUrl() {
    return (
      process.env.FLOWSHOPY_PYTHON_URL?.trim() ||
      `https://www.python.org/ftp/python/${this.pythonVersion}/python-${this.pythonVersion}-embed-amd64.zip`
    );
  },
  getPipUrl:
    process.env.FLOWSHOPY_GET_PIP_URL?.trim() || "https://bootstrap.pypa.io/get-pip.py",
  fasterWhisperModel:
    process.env.FLOWSHOPY_FASTER_WHISPER_MODEL?.trim() || "small"
};
