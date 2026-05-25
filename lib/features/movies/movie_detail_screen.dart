import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xtream_code_client/xtream_code_client.dart' hide Icon;

import '../../core/widgets/common_widgets.dart';
import '../../data/models/watch_history_entry.dart';
import '../../data/services/playback_helpers.dart';
import '../../providers/watch_history_provider.dart';
import '../../providers/xtream_repository_provider.dart';

class MovieDetailScreen extends ConsumerStatefulWidget {
  const MovieDetailScreen({super.key, required this.movie});

  final VodItem movie;

  @override
  ConsumerState<MovieDetailScreen> createState() => _MovieDetailScreenState();
}

class _MovieDetailScreenState extends ConsumerState<MovieDetailScreen> {
  VodInfo? _vodInfo;
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repository = ref.read(xtreamRepositoryProvider);
    if (repository == null) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Not connected.';
      });
      return;
    }

    try {
      final info = await repository.getVodInfo(widget.movie);
      if (mounted) {
        setState(() {
          _vodInfo = info;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Failed to load movie details.';
        });
      }
    }
  }

  void _play() {
    final repository = ref.read(xtreamRepositoryProvider);
    if (repository == null) {
      return;
    }

    try {
      final url = repository.buildVodUrl(widget.movie);
      final history = ref.read(watchHistoryProvider).entries;
      final contentKey = widget.movie.streamId != null
          ? WatchHistoryEntry.vodContentKey(widget.movie.streamId!)
          : null;
      final resumeMs = resumePositionForContent(
        history: history,
        contentKey: contentKey,
      );

      final request = playbackRequestForVod(
        item: widget.movie,
        url: url,
        resumePositionMs: resumeMs ?? 0,
      );

      context.push('/player', extra: request);
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to play this movie.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final title =
        widget.movie.name ?? widget.movie.title ?? 'Movie';
    final details = _vodInfo?.info;

    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const LoadingState(message: 'Loading movie…'),
      );
    }

    if (_errorMessage != null) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: ErrorState(message: _errorMessage!, onRetry: _load),
      );
    }

    final backdrop = details?.backdropPath?.isNotEmpty == true
        ? details!.backdropPath!.first
        : details?.coverBig ?? widget.movie.streamIcon;
    final plot = details?.plot ?? details?.description;
    final genre = details?.genre;
    final cast = details?.cast ?? details?.actors;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 220,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              title: Text(title),
              background: backdrop != null && backdrop.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: backdrop,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) => const ColoredBox(
                        color: Colors.black26,
                      ),
                    )
                  : null,
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.movie.year != null)
                    Text(
                      widget.movie.year!,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  if (details?.rating != null) ...[
                    const SizedBox(height: 8),
                    Text('Rating: ${details!.rating}'),
                  ],
                  if (genre != null && genre.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Genre: $genre'),
                  ],
                  if (cast != null && cast.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Cast: $cast'),
                  ],
                  if (plot != null && plot.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text(plot, style: Theme.of(context).textTheme.bodyLarge),
                  ],
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: _play,
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('Play'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
