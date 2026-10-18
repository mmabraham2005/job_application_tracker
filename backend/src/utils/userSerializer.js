const serializeUser = (user) => ({
  id: user._id,
  authProvider: user.authProvider,
  email: user.email,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
});

module.exports = { serializeUser };
