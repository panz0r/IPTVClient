import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../../core/widgets/debug_log_panel.dart';
import '../../data/models/playback_request.dart';
import '../../data/services/stream_probe_service.dart';

class PlayerScreen extends StatefulWidget {
  const PlayerScreen({super.key, required this.request});

  final PlaybackRequest request;

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  late final Player _player;
  late final VideoController _controller;
  late final StreamProbeService _probeService;

  final StringBuffer _debugLog = StringBuffer();
  String? _errorMessage;
  String? _lastPlayerError;
  bool _isBuffering = true;
  bool _showDebugLog = false;
  int _urlIndex = 0;
  bool _triedAllUrls = false;

  @override
  void initState() {
    super.initState();
    _probeService = StreamProbeService();
    _player = Player();
    _controller = VideoController(_player);

    _appendLog('=== Playback debug ===');
    _appendLog('Title: ${widget.request.title}');
    _appendLog('Kind: ${widget.request.kind.name}');
    if (widget.request.streamId != null) {
      _appendLog('Stream id: ${widget.request.streamId}');
    }
    _appendLog('Candidate URLs: ${widget.request.allUrls.length}');
    for (var i = 0; i < widget.request.allUrls.length; i++) {
      _appendLog('  ${i + 1}. ${widget.request.allUrls[i]}');
    }
    _appendLog('');

    _player.stream.buffering.listen((buffering) {
      if (!mounted) {
        return;
      }
      setState(() => _isBuffering = buffering);
    });

    _player.stream.error.listen((error) {
      if (!mounted) {
        return;
      }
      _lastPlayerError = error;
      _appendLog('media_kit error: $error');
      _tryNextUrl('Player reported an error.');
    });

    if (widget.request.isLive) {
      _showDebugLog = true;
      _startLivePlayback();
    } else {
      _openUrl(widget.request.url, index: 0);
    }
  }

  Future<void> _startLivePlayback() async {
    setState(() {
      _isBuffering = true;
      _errorMessage = null;
    });

    _appendLog('Probing live stream URLs...');
    _appendLog('');
    var startIndex = 0;
    try {
      final probeResults = await _probeService.probeAll(widget.request.allUrls);
      _appendLog(StreamProbeService.formatProbeLog(probeResults));

      final reachableIndex = probeResults.indexWhere((result) => result.reachable);
      if (reachableIndex >= 0) {
        startIndex = reachableIndex;
        if (startIndex > 0) {
          _appendLog('');
          _appendLog(
            'Starting with candidate ${startIndex + 1} '
            '(first URL that responded OK to HTTP probe).',
          );
        }
      } else {
        _appendLog('');
        _appendLog(
          'No candidate returned HTTP 200/206; trying candidate 1 in player anyway.',
        );
      }
    } catch (error) {
      _appendLog('Probe failed: $error');
    }
    _appendLog('');

    if (!mounted) {
      return;
    }

    await _openUrl(
      widget.request.allUrls[startIndex],
      index: startIndex,
    );
  }

  Future<void> _openUrl(String url, {required int index}) async {
    _urlIndex = index;
    _appendLog('--- Opening in player ---');
    _appendLog('Candidate ${index + 1}/${widget.request.allUrls.length}');
    _appendLog(url);
    _appendLog('');

    if (!mounted) {
      return;
    }
    setState(() {
      _isBuffering = true;
      _errorMessage = null;
    });

    try {
      await _player.open(Media(url));
      if (!mounted) {
        return;
      }
      setState(() => _isBuffering = _player.state.buffering);
    } catch (error) {
      _appendLog('open() failed: $error');
      await _tryNextUrl('Could not open stream URL.');
    }
  }

  Future<void> _tryNextUrl(String reason) async {
    if (!mounted) {
      return;
    }

    final nextIndex = _urlIndex + 1;
    if (nextIndex < widget.request.allUrls.length) {
      _appendLog('Fallback: $reason Trying next format/URL...');
      _appendLog('');
      await _openUrl(widget.request.allUrls[nextIndex], index: nextIndex);
      return;
    }

    if (_triedAllUrls) {
      return;
    }
    _triedAllUrls = true;

    final detail = _lastPlayerError != null
        ? '\n\nPlayer: $_lastPlayerError'
        : '';
    setState(() {
      _isBuffering = false;
      _errorMessage =
          'Playback failed after trying ${widget.request.allUrls.length} '
          'URL(s). Open the debug log below for HTTP probe details.$detail';
      _showDebugLog = true;
    });
  }

  void _appendLog(String line) {
    _debugLog.writeln(line);
    if (mounted && _showDebugLog) {
      setState(() {});
    }
  }

  @override
  void dispose() {
    _probeService.close();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final logText = _debugLog.toString();

    return Scaffold(
      backgroundColor: Colors.black,
      body: Column(
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                Video(
                  controller: _controller,
                  controls: MaterialVideoControls,
                ),
                SafeArea(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          IconButton(
                            onPressed: () => Navigator.of(context).maybePop(),
                            icon: const Icon(Icons.arrow_back,
                                color: Colors.white),
                          ),
                          if (widget.request.isLive)
                            TextButton.icon(
                              onPressed: () {
                                setState(
                                  () => _showDebugLog = !_showDebugLog,
                                );
                              },
                              icon: Icon(
                                _showDebugLog
                                    ? Icons.bug_report
                                    : Icons.bug_report_outlined,
                                color: Colors.white70,
                                size: 18,
                              ),
                              label: Text(
                                _showDebugLog ? 'Hide log' : 'Debug log',
                                style: const TextStyle(color: Colors.white70),
                              ),
                            ),
                          const Spacer(),
                          if (widget.request.allUrls.length > 1)
                            Padding(
                              padding: const EdgeInsets.only(right: 12),
                              child: Text(
                                'URL ${_urlIndex + 1}/${widget.request.allUrls.length}',
                                style: const TextStyle(
                                  color: Colors.white54,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                        ],
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          widget.request.title,
                          style:
                              Theme.of(context).textTheme.titleLarge?.copyWith(
                                    color: Colors.white,
                                  ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_isBuffering && _errorMessage == null)
                  const ColoredBox(
                    color: Colors.black54,
                    child: Center(child: CircularProgressIndicator()),
                  ),
                if (_errorMessage != null)
                  ColoredBox(
                    color: Colors.black87,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.error_outline,
                                color: Colors.white, size: 48),
                            const SizedBox(height: 16),
                            Text(
                              _errorMessage!,
                              style: const TextStyle(color: Colors.white),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 16),
                            FilledButton(
                              onPressed: () {
                                setState(() => _showDebugLog = true);
                              },
                              child: const Text('Show debug log'),
                            ),
                            const SizedBox(height: 8),
                            FilledButton.tonal(
                              onPressed: () => Navigator.of(context).maybePop(),
                              child: const Text('Go back'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (_showDebugLog)
            SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.38,
              child: DebugLogPanel(
                log: logText,
                title: widget.request.isLive
                    ? 'Live TV playback log'
                    : 'Playback log',
              ),
            ),
        ],
      ),
    );
  }
}
