import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:iptv/app.dart';
import 'package:iptv/data/models/xtream_credentials.dart';
import 'package:iptv/data/services/credentials_store.dart';
import 'package:iptv/providers/auth_provider.dart';

class _FakeCredentialsStore extends CredentialsStore {
  @override
  Future<XtreamCredentials?> load() async => null;
}

void main() {
  testWidgets('App shows login screen', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          credentialsStoreProvider.overrideWithValue(_FakeCredentialsStore()),
        ],
        child: const IptvApp(),
      ),
    );

    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('IPTV Player'), findsWidgets);
    expect(find.text('Connect'), findsOneWidget);
  });
}
