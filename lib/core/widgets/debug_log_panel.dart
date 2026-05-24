import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class DebugLogPanel extends StatelessWidget {
  const DebugLogPanel({
    super.key,
    required this.log,
    this.title = 'Connection log (verbose)',
  });

  final String? log;
  final String title;

  @override
  Widget build(BuildContext context) {
    final hasLog = log != null && log!.trim().isNotEmpty;

    return Card(
      margin: const EdgeInsets.all(24),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
            child: Row(
              children: [
                Icon(
                  Icons.terminal,
                  size: 20,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (hasLog)
                  IconButton(
                    tooltip: 'Copy log',
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: log!));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Log copied to clipboard')),
                      );
                    },
                    icon: const Icon(Icons.copy, size: 20),
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ColoredBox(
              color: const Color(0xFF0A0A0E),
              child: hasLog
                  ? Scrollbar(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: SelectableText(
                          log!,
                          style: const TextStyle(
                            fontFamily: 'Consolas',
                            fontFamilyFallback: ['Courier New', 'monospace'],
                            fontSize: 12,
                            height: 1.45,
                            color: Color(0xFFD4D4D4),
                          ),
                        ),
                      ),
                    )
                  : Center(
                      child: Text(
                        'Attempt a login to see request and response details here.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                        textAlign: TextAlign.center,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
