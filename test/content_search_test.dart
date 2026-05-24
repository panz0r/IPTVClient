import 'package:flutter_test/flutter_test.dart';
import 'package:iptv/data/services/content_search.dart';

void main() {
  test('filterContent matches case-insensitively', () {
    final results = filterContent(
      ['BBC One', 'CNN', 'SVT1'],
      'bbc',
      (item) => item,
    );

    expect(results, ['BBC One']);
  });

  test('empty query returns all items', () {
    final items = ['A', 'B'];
    expect(filterContent(items, '', (item) => item), items);
  });
}
