import 'dart:async';

import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';

import 'player_track_utils.dart';

/// Netflix-style audio / subtitle picker shown above the control bar.
class PlayerTrackMenu extends StatefulWidget {
  const PlayerTrackMenu({
    super.key,
    required this.player,
    required this.onInteraction,
  });

  final Player player;
  final VoidCallback onInteraction;

  @override
  State<PlayerTrackMenu> createState() => _PlayerTrackMenuState();
}

class _PlayerTrackMenuState extends State<PlayerTrackMenu> {
  late Tracks _tracks = widget.player.state.tracks;
  late Track _selected = widget.player.state.track;
  final List<StreamSubscription<dynamic>> _subscriptions = [];

  @override
  void initState() {
    super.initState();
    _subscriptions.addAll([
      widget.player.stream.tracks.listen((tracks) {
        if (mounted) {
          setState(() => _tracks = tracks);
        }
      }),
      widget.player.stream.track.listen((track) {
        if (mounted) {
          setState(() => _selected = track);
        }
      }),
    ]);
  }

  @override
  void dispose() {
    for (final sub in _subscriptions) {
      unawaited(sub.cancel());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final audioOptions = selectableAudioTracks(_tracks.audio);
    final subtitleOptions = selectableSubtitleTracks(_tracks.subtitle);

    if (audioOptions.length <= 1 && subtitleOptions.isEmpty) {
      return const SizedBox.shrink();
    }

    final maxHeight = MediaQuery.sizeOf(context).height * 0.42;

    return Container(
      constraints: BoxConstraints(maxHeight: maxHeight),
      margin: const EdgeInsets.fromLTRB(48, 0, 48, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (audioOptions.length > 1)
            Expanded(
              child: _TrackColumn<AudioTrack>(
                title: 'Audio',
                options: audioOptions,
                selected: _selected.audio,
                labelFor: trackDisplayLabel,
                onSelected: (track) {
                  widget.onInteraction();
                  unawaited(widget.player.setAudioTrack(track));
                },
              ),
            ),
          if (audioOptions.length > 1 && subtitleOptions.isNotEmpty)
            const VerticalDivider(
              width: 1,
              thickness: 1,
              color: Color(0x33FFFFFF),
            ),
          if (subtitleOptions.isNotEmpty)
            Expanded(
              child: _TrackColumn<SubtitleTrack>(
                title: 'Subtitles',
                options: subtitleOptions,
                selected: _selected.subtitle,
                labelFor: trackDisplayLabel,
                onSelected: (track) {
                  widget.onInteraction();
                  unawaited(widget.player.setSubtitleTrack(track));
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _TrackColumn<T> extends StatelessWidget {
  const _TrackColumn({
    required this.title,
    required this.options,
    required this.selected,
    required this.labelFor,
    required this.onSelected,
  });

  final String title;
  final List<T> options;
  final T selected;
  final String Function(T track) labelFor;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
          child: Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.only(bottom: 8),
            itemCount: options.length,
            itemBuilder: (context, index) {
              final option = options[index];
              final isSelected = option == selected;
              return InkWell(
                onTap: () => onSelected(option),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 10,
                  ),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 28,
                        child: isSelected
                            ? const Icon(
                                Icons.check,
                                color: Colors.white,
                                size: 22,
                              )
                            : null,
                      ),
                      Expanded(
                        child: Text(
                          labelFor(option),
                          style: TextStyle(
                            color: isSelected
                                ? Colors.white
                                : const Color(0xB3FFFFFF),
                            fontSize: 18,
                            fontWeight: isSelected
                                ? FontWeight.w500
                                : FontWeight.normal,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
