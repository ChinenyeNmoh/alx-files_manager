const { ObjectId } = require('mongodb');
const sha1 = require('sha1');
const redisClient = require('../utils/redis').default;
const dbClient = require('../utils/db').default;

const postNew = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email) {
      return res.status(400).json({
        error: 'Missing email',
      });
    }
    if (!password) {
      return res.status(400).json({
        error: 'Missing password',
      });
    }
    const emailExist = await dbClient.db.collection('users').findOne({ email });
    if (emailExist) {
      return res.status(400).json({
        error: 'Already exist',
      });
    }
    const hashedPassword = sha1(password);
    const newBody = {
      email,
      password: hashedPassword,
    };
    const newUser = await dbClient.db.collection('users').insertOne(newBody);
    return res.status(201).json({
      id: newUser.insertedId,
      email,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

const getMe = async (req, res) => {
  const token = req.header('X-Token') || null;
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }
  try {
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }
    const findUser = await dbClient.db.collection('users').findOne({ _id: ObjectId(userId) });
    if (!findUser) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }
    return res.status(200).json({
      id: findUser._id,
      email: findUser.email,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

module.exports = { postNew, getMe };
