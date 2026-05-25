import 'package:media_kit/media_kit.dart';

List<AudioTrack> selectableAudioTracks(List<AudioTrack> tracks) {
  final embedded =
      tracks.where((t) => t.id != 'auto' && t.id != 'no').toList();
  if (embedded.length > 1) {
    return embedded;
  }
  return const [];
}

List<SubtitleTrack> selectableSubtitleTracks(List<SubtitleTrack> tracks) {
  final embedded = tracks.where((t) => t.id != 'auto').toList();
  if (embedded.isEmpty) {
    return const [];
  }
  return embedded;
}

bool hasTrackSelectionOptions(Tracks tracks) {
  return selectableAudioTracks(tracks.audio).length > 1 ||
      selectableSubtitleTracks(tracks.subtitle).isNotEmpty;
}

String trackDisplayLabel(dynamic track) {
  if (track is SubtitleTrack && track.id == 'no') {
    return 'Off';
  }
  final title = track.title as String?;
  final language = track.language as String?;
  if (title != null && title.trim().isNotEmpty) {
    return title.trim();
  }
  if (language != null && language.trim().isNotEmpty) {
    return language.trim();
  }
  return 'Track ${track.id}';
}
