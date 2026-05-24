import 'package:flutter_riverpod/flutter_riverpod.dart';

class LoginFormState {
  const LoginFormState({
    this.serverUrl = '',
    this.username = '',
    this.password = '',
  });

  final String serverUrl;
  final String username;
  final String password;

  LoginFormState copyWith({
    String? serverUrl,
    String? username,
    String? password,
  }) {
    return LoginFormState(
      serverUrl: serverUrl ?? this.serverUrl,
      username: username ?? this.username,
      password: password ?? this.password,
    );
  }
}

final loginFormProvider =
    NotifierProvider<LoginFormNotifier, LoginFormState>(
  LoginFormNotifier.new,
);

class LoginFormNotifier extends Notifier<LoginFormState> {
  @override
  LoginFormState build() => const LoginFormState();

  void setServerUrl(String value) {
    state = state.copyWith(serverUrl: value);
  }

  void setUsername(String value) {
    state = state.copyWith(username: value);
  }

  void setPassword(String value) {
    state = state.copyWith(password: value);
  }

  void setAll({
    required String serverUrl,
    required String username,
    required String password,
  }) {
    state = LoginFormState(
      serverUrl: serverUrl,
      username: username,
      password: password,
    );
  }
}
