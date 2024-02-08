const redisClient = require('../utils/redis').default;
const dbClient = require('../utils/db').default;
const sha1 = require('sha1');
const { v4 } = require('uuid');

const getConnect = async (req, res) => {
    const Authorization = req.header('Authorization');
    if (!Authorization) {
        return res.status(401).json({
            error: 'Unauthorized'
        });
    }
    const base64Credentials = Authorization.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const email = credentials.split(':')[0];
    const password = credentials.split(':')[1];
    const hashpass = sha1(password);
    try {
        const findUser = await dbClient.db.collection('users').findOne({ email: email, password: hashpass });
        if (!findUser) {
            return res.status(401).json({
                error: 'Unauthorized'
            });
        } else {

            const token = v4();
            const key = `auth_${token}`;
            redisClient.set(key, 86400, findUser._id.toString());
            return res.status(200).json({
                token: token
            });
        }
    } catch (err) {
        return res.status(500).json({
            error: err.message
        });
    }
};

// logout
const getDisconnect = async (req, res) => {
    const token = req.header('X-Token');
    if (!token) {
        return res.status(401).json({
            error: 'Unauthorized'
        });
    }
    try {
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) {
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }
        await redisClient.del(`auth_${token}`);
        return res.status(204).json();
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            error: err.message
        });
    }
};

module.exports = { getConnect, getDisconnect }
