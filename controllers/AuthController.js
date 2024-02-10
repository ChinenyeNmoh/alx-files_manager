const sha1 = require('sha1');
const { v4 } = require('uuid');
const redisClient = require('../utils/redis').default;
const dbClient = require('../utils/db').default;

const getConnect = async (req, res) => {
  const Authorization = req.header('Authorization') || null;
  if (!Authorization) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }
  const base64Credentials = Authorization.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const email = credentials.split(':')[0];
  const password = credentials.split(':')[1];
  if(!email || !password){
    return res.status(401).json({
        error: 'Unauthorized',
      });
  }
  const hashpass = sha1(password);
  try {
    const findUser = await dbClient.db.collection('users').findOne({ email, password: hashpass });
    if (!findUser) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }
    const token = v4();
    const key = `auth_${token}`;
    redisClient.set(key, findUser._id.toString(), 86400);
    return res.status(200).json({
      token,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

// logout
const getDisconnect = async (req, res) => {
  const token = req.header('X-Token');
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
    await redisClient.del(`auth_${token}`);
    return res.status(204).json();
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: err.message,
    });
  }
};

module.exports = { getConnect, getDisconnect };
