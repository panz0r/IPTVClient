import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import 'hub_row_scroll_behavior.dart';

/// Horizontally scrollable row for nested use inside a vertical scroll view.
/// Supports mouse click-drag, trackpad, touch drag, and wheel scrolling.
class HorizontalPosterRow extends StatefulWidget {
  const HorizontalPosterRow({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.height = 200,
    this.separatorWidth = 12,
    this.padding = const EdgeInsets.symmetric(horizontal: 16),
  });

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final double height;
  final double separatorWidth;
  final EdgeInsets padding;

  @override
  State<HorizontalPosterRow> createState() => _HorizontalPosterRowState();
}

class _HorizontalPosterRowState extends State<HorizontalPosterRow> {
  static const _dragThreshold = 8.0;

  late final ScrollController _controller;
  bool _mouseDragActive = false;
  double? _dragStartX;
  double? _dragStartScrollOffset;

  @override
  void initState() {
    super.initState();
    _controller = ScrollController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _endMouseDrag() {
    if (_mouseDragActive) {
      setState(() => _mouseDragActive = false);
    }
    _dragStartX = null;
    _dragStartScrollOffset = null;
  }

  void _scrollBy(double delta) {
    if (!_controller.hasClients || delta == 0) {
      return;
    }
    final position = _controller.position;
    final target = (_controller.offset - delta).clamp(
      0.0,
      position.maxScrollExtent,
    );
    _controller.jumpTo(target);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.itemCount == 0) {
      return SizedBox(height: widget.height);
    }

    return SizedBox(
      height: widget.height,
      child: MouseRegion(
        cursor:
            _mouseDragActive ? SystemMouseCursors.grabbing : SystemMouseCursors.grab,
        child: ScrollConfiguration(
          behavior: const HubRowScrollBehavior(),
          child: Listener(
            behavior: HitTestBehavior.translucent,
            onPointerDown: (event) {
              if (event.kind == PointerDeviceKind.mouse &&
                  event.buttons == kPrimaryMouseButton) {
                _dragStartX = event.position.dx;
                _dragStartScrollOffset =
                    _controller.hasClients ? _controller.offset : 0;
              }
            },
            onPointerMove: (event) {
              if (_dragStartX == null || _dragStartScrollOffset == null) {
                return;
              }
              final delta = event.position.dx - _dragStartX!;
              if (!_mouseDragActive && delta.abs() < _dragThreshold) {
                return;
              }
              if (!_mouseDragActive) {
                setState(() => _mouseDragActive = true);
              }
              if (!_controller.hasClients) {
                return;
              }
              final max = _controller.position.maxScrollExtent;
              _controller.jumpTo(
                (_dragStartScrollOffset! - delta).clamp(0.0, max),
              );
            },
            onPointerUp: (_) => _endMouseDrag(),
            onPointerCancel: (_) => _endMouseDrag(),
            onPointerSignal: (event) {
              if (event is PointerScrollEvent) {
                final delta = event.scrollDelta.dy != 0
                    ? event.scrollDelta.dy
                    : event.scrollDelta.dx;
                _scrollBy(delta);
              }
            },
            child: ListView.separated(
              controller: _controller,
              scrollDirection: Axis.horizontal,
              padding: widget.padding,
              primary: false,
              physics: const ClampingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              itemCount: widget.itemCount,
              separatorBuilder: (_, _) =>
                  SizedBox(width: widget.separatorWidth),
              itemBuilder: widget.itemBuilder,
            ),
          ),
        ),
      ),
    );
  }
}
