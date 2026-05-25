import 'dart:async';

import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:media_kit_video/media_kit_video_controls/src/controls/extensions/duration.dart';
import 'package:media_kit_video/media_kit_video_controls/src/controls/methods/video_state.dart';

import 'player_track_menu.dart';
import 'player_track_utils.dart';

/// Unified Netflix-style player controls (timeline, transport, audio/subtitles).
class IptvVideoControls extends StatefulWidget {
  const IptvVideoControls({
    super.key,
    required this.state,
    required this.title,
    this.showSeekBar = true,
  });

  final VideoState state;
  final String title;
  final bool showSeekBar;

  @override
  State<IptvVideoControls> createState() => _IptvVideoControlsState();
}

class _IptvVideoControlsState extends State<IptvVideoControls> {
  bool _visible = false;
  bool _trackMenuOpen = false;
  Timer? _hideTimer;

  late Player _player;
  late bool _playing;
  late bool _buffering;
  late Duration _position;
  late Duration _duration;
  late Duration _buffer;
  late double _volume;
  late Tracks _tracks;
  late double _playbackRate;

  bool _seekDragging = false;
  double _seekFraction = 0;
  double? _volumeBeforeMute;

  final List<StreamSubscription<dynamic>> _subscriptions = [];

  static const _hideAfter = Duration(seconds: 4);
  static const _fadeDuration = Duration(milliseconds: 220);
  static const _playbackRates = [0.75, 1.0, 1.25, 1.5, 2.0];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_subscriptions.isEmpty) {
      _player = controller(context).player;
      final state = _player.state;
      _playing = state.playing;
      _buffering = state.buffering;
      _position = state.position;
      _duration = state.duration;
      _buffer = state.buffer;
      _volume = state.volume;
      _tracks = state.tracks;
      _playbackRate = state.rate;
      _bindPlayerStreams();
    }
  }

  void _bindPlayerStreams() {
    _subscriptions.addAll([
      _player.stream.playing.listen((v) {
        if (mounted) setState(() => _playing = v);
      }),
      _player.stream.buffering.listen((v) {
        if (mounted) setState(() => _buffering = v);
      }),
      _player.stream.position.listen((v) {
        if (mounted && !_seekDragging) setState(() => _position = v);
      }),
      _player.stream.duration.listen((v) {
        if (mounted) setState(() => _duration = v);
      }),
      _player.stream.buffer.listen((v) {
        if (mounted) setState(() => _buffer = v);
      }),
      _player.stream.volume.listen((v) {
        if (mounted) setState(() => _volume = v);
      }),
      _player.stream.tracks.listen((v) {
        if (mounted) setState(() => _tracks = v);
      }),
      _player.stream.rate.listen((v) {
        if (mounted) setState(() => _playbackRate = v);
      }),
    ]);
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    for (final sub in _subscriptions) {
      unawaited(sub.cancel());
    }
    super.dispose();
  }

  void _resetHideTimer() {
    _hideTimer?.cancel();
    if (!_visible) {
      return;
    }
    _hideTimer = Timer(_hideAfter, () {
      if (mounted) {
        setState(() {
          _visible = false;
          _trackMenuOpen = false;
        });
      }
    });
  }

  void _showControls({bool keepMenu = false}) {
    setState(() {
      _visible = true;
      if (!keepMenu) {
        _trackMenuOpen = false;
      }
    });
    _resetHideTimer();
  }

  void _onUserInteraction() {
    if (!_visible) {
      _showControls(keepMenu: _trackMenuOpen);
    } else {
      _resetHideTimer();
    }
  }

  Future<void> _togglePlayPause() async {
    _onUserInteraction();
    await _player.playOrPause();
  }

  Future<void> _seekRelative(int seconds) async {
    _onUserInteraction();
    final target = (_position + Duration(seconds: seconds)).clamp(
      Duration.zero,
      _duration,
    );
    await _player.seek(target);
  }

  void _toggleMute() {
    _onUserInteraction();
    if (_volume > 0) {
      _volumeBeforeMute = _volume;
      _player.setVolume(0);
    } else {
      _player.setVolume(_volumeBeforeMute ?? 100);
    }
  }

  void _cyclePlaybackSpeed() {
    _onUserInteraction();
    final index = _playbackRates.indexWhere((r) => (r - _playbackRate).abs() < 0.01);
    final next = _playbackRates[(index + 1) % _playbackRates.length];
    _player.setRate(next);
  }

  double get _positionFraction {
    if (_duration == Duration.zero) {
      return 0;
    }
    return (_position.inMilliseconds / _duration.inMilliseconds).clamp(0.0, 1.0);
  }

  double get _bufferFraction {
    if (_duration == Duration.zero) {
      return 0;
    }
    return (_buffer.inMilliseconds / _duration.inMilliseconds).clamp(0.0, 1.0);
  }

  bool get _hasTrackOptions => hasTrackSelectionOptions(_tracks);

  double _fractionFromSeekEvent(PointerEvent event, double width) {
    if (width <= 0) {
      return 0;
    }
    return (event.localPosition.dx / width).clamp(0.0, 1.0);
  }

  Future<void> _commitSeek() async {
    if (!_seekDragging) {
      return;
    }
    final target = Duration(
      milliseconds: (_duration.inMilliseconds * _seekFraction).round(),
    );
    setState(() {
      _seekDragging = false;
      _position = target;
    });
    await _player.seek(target);
    _resetHideTimer();
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.paddingOf(context).bottom;
    final controlsOpacity = _visible ? 1.0 : 0.0;

    return MouseRegion(
      onHover: (_) => _showControls(keepMenu: _trackMenuOpen),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: () {
                if (_visible) {
                  unawaited(_togglePlayPause());
                } else {
                  _showControls();
                }
              },
            ),
          ),
          AnimatedOpacity(
            opacity: controlsOpacity,
            duration: _fadeDuration,
            child: IgnorePointer(
              ignoring: !_visible,
              child: Align(
                alignment: Alignment.bottomCenter,
                child: GestureDetector(
                  onTap: _onUserInteraction,
                  behavior: HitTestBehavior.opaque,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.92),
                          Colors.black.withValues(alpha: 0.55),
                          Colors.transparent,
                        ],
                        stops: const [0.0, 0.45, 1.0],
                      ),
                    ),
                    child: Padding(
                      padding: EdgeInsets.only(bottom: bottomPadding),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_trackMenuOpen && _hasTrackOptions)
                            SizedBox(
                              height: MediaQuery.sizeOf(context).height * 0.38,
                              child: PlayerTrackMenu(
                                player: _player,
                                onInteraction: _onUserInteraction,
                              ),
                            ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
                            child: _buildSeekSection(context),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
                            child: _buildTransportRow(context),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (_buffering)
            const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
        ],
      ),
    );
  }

  Widget _buildSeekSection(BuildContext context) {
    if (!widget.showSeekBar) {
      return const SizedBox.shrink();
    }

    final displayFraction =
        _seekDragging ? _seekFraction : _positionFraction;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (_duration > Duration.zero)
          Padding(
            padding: const EdgeInsets.only(bottom: 6, right: 2),
            child: Text(
              _duration.label(),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        LayoutBuilder(
          builder: (context, constraints) {
            return MouseRegion(
              cursor: SystemMouseCursors.click,
              child: Listener(
                onPointerDown: (event) {
                  _onUserInteraction();
                  final fraction = _fractionFromSeekEvent(
                    event,
                    constraints.maxWidth,
                  );
                  setState(() {
                    _seekDragging = true;
                    _seekFraction = fraction;
                  });
                },
                onPointerMove: (event) {
                  if (!_seekDragging) {
                    return;
                  }
                  setState(
                    () => _seekFraction = _fractionFromSeekEvent(
                      event,
                      constraints.maxWidth,
                    ),
                  );
                },
                onPointerUp: (_) => unawaited(_commitSeek()),
                onPointerCancel: (_) => unawaited(_commitSeek()),
                child: SizedBox(
                  height: 20,
                  width: constraints.maxWidth,
                  child: Stack(
                    alignment: Alignment.centerLeft,
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        height: 3,
                        decoration: BoxDecoration(
                          color: const Color(0x4DFFFFFF),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      FractionallySizedBox(
                        widthFactor: _bufferFraction,
                        child: Container(
                          height: 3,
                          decoration: BoxDecoration(
                            color: const Color(0x99FFFFFF),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      FractionallySizedBox(
                        widthFactor: displayFraction,
                        child: Container(
                          height: 3,
                          decoration: BoxDecoration(
                            color: const Color(0xFFE50914),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      Positioned(
                        left: (constraints.maxWidth - 12) * displayFraction,
                        child: Container(
                          width: 12,
                          height: 12,
                          decoration: const BoxDecoration(
                            color: Color(0xFFE50914),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildTransportRow(BuildContext context) {
    return Row(
      children: [
        _ControlIconButton(
          icon: _playing ? Icons.pause : Icons.play_arrow,
          iconSize: 32,
          onPressed: () => unawaited(_togglePlayPause()),
        ),
        if (widget.showSeekBar) ...[
          _ControlIconButton(
            icon: Icons.replay_10,
            onPressed: () => unawaited(_seekRelative(-10)),
          ),
          _ControlIconButton(
            icon: Icons.forward_10,
            onPressed: () => unawaited(_seekRelative(10)),
          ),
        ],
        _ControlIconButton(
          icon: _volume > 0 ? Icons.volume_up : Icons.volume_off,
          onPressed: _toggleMute,
        ),
        Expanded(
          child: Text(
            widget.title,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        if (_hasTrackOptions)
          _ControlIconButton(
            icon: Icons.subtitles_outlined,
            highlighted: _trackMenuOpen,
            onPressed: () {
              _onUserInteraction();
              setState(() => _trackMenuOpen = !_trackMenuOpen);
              _resetHideTimer();
            },
          ),
        if (widget.showSeekBar)
          _ControlIconButton(
            icon: Icons.speed,
            onPressed: _cyclePlaybackSpeed,
            tooltip: '${_playbackRate}x',
          ),
        _ControlIconButton(
          icon: isFullscreen(context)
              ? Icons.fullscreen_exit
              : Icons.fullscreen,
          onPressed: () {
            _onUserInteraction();
            unawaited(toggleFullscreen(context));
          },
        ),
      ],
    );
  }
}

class _ControlIconButton extends StatelessWidget {
  const _ControlIconButton({
    required this.icon,
    required this.onPressed,
    this.iconSize = 26,
    this.highlighted = false,
    this.tooltip,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final double iconSize;
  final bool highlighted;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      icon: Icon(icon, size: iconSize),
      color: highlighted ? const Color(0xFFE50914) : Colors.white,
      splashRadius: 22,
    );
  }
}

/// Builder for [Video.controls] with title and seek-bar options.
VideoControlsBuilder iptvVideoControlsBuilder({
  required String title,
  required bool showSeekBar,
}) {
  return (VideoState state) => IptvVideoControls(
        state: state,
        title: title,
        showSeekBar: showSeekBar,
      );
}
