const createUserSession = async (req, userId) => {
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      resolve();
    });
  });

  req.session.userId = userId.toString();

  await new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
};

module.exports = { createUserSession };
