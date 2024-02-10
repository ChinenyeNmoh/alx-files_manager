const fs = require('fs');
const Bull = require('bull');
const { ObjectId } = require('mongodb');
const mimeTypes = require('mime-types');
const { v4 } = require('uuid');
const redisClient = require('../utils/redis').default;
const dbClient = require('../utils/db').default;

const postUpload = async (req, res) => {
  const fileQueue = new Bull('fileQueue');
  const token = req.header('X-Token') || null;
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }
  const {
    name,
    type,
    data,
  } = req.body;
  const parentId = req.body.parentId || 0;
  const isPublic = req.body.isPublic || false;
  const fileTypes = ['folder', 'file', 'image'];
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
    if (!name) {
      return res.status(400).json({
        error: 'Missing name',
      });
    }
    if (!type || !fileTypes.includes(type)) {
      return res.status(400).json({
        error: 'Missing type',
      });
    }
    if (!data && type !== 'folder') {
      return res.status(400).json({
        error: 'Missing data',
      });
    }
    if (parentId !== 0) {
      const findParent = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
      if (!findParent) {
        return res.status(400).json({
          error: 'Parent not found',
        });
      }
      if (findParent && findParent.type !== 'folder') {
        return res.status(400).json({
          error: 'Parent is not a folder',
        });
      }
    }
    const newFileBody = {
      userId: findUser._id,
      name,
      type,
      parentId,
      isPublic,
    };
    if (newFileBody.type === 'folder') {
      await dbClient.db.collection('files').insertOne(newFileBody);
      const responseFileBody = {
        id: newFileBody._id,
        userId: newFileBody.userId,
        name: newFileBody.name,
        type: newFileBody.type,
        parentId: newFileBody.parentId,
        isPublic: newFileBody.isPublic,
      };
      return res.status(201).json(responseFileBody);
    }
    const localpath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fs.mkdir(localpath, { recursive: true }, (error) => {
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return true;
    });
    const pathFile = v4();
    const completePath = `${localpath}/${pathFile}`;
    const buff = Buffer.from(data, 'base64');
    await fs.writeFile(completePath, buff, (error) => {
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return true;
    });
    newFileBody.localPath = completePath;
    await dbClient.db.collection('files').insertOne(newFileBody);
    const responseFileBody = {
      id: newFileBody._id,
      userId: newFileBody.userId,
      name: newFileBody.name,
      type: newFileBody.type,
      parentId: newFileBody.parentId,
      isPublic: newFileBody.isPublic,
    };
    fileQueue.add({
      userId: newFileBody.userId,
      fileId: newFileBody._id,
    });
    return res.status(201).json(responseFileBody);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

// Get users file
const getShow = async (req, res) => {
  const fileId = req.params.id || '';
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
    const findFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: findUser._id });
    if (!findFile) {
      return res.status(404).json({
        error: 'Not found',
      });
    }
    const result = {
      id: findFile._id,
      userId: findFile.userId,
      name: findFile.name,
      type: findFile.type,
      isPublic: findFile.isPublic,
      parentId: findFile.parentId,
    };
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

// Get all files
const getIndex = async (req, res) => {
  const parentId = req.query.parentId || 0;
  const pagination = req.query.page || 0;
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
    const aggregationMatch = { $and: [{ parentId }] };
    let aggregateData = [{ $match: aggregationMatch }, { $skip: pagination * 20 }, { $limit: 20 }];
    if (parentId === 0) {
      aggregateData = [{ $skip: pagination * 20 }, { $limit: 20 }];
    }
    const files = await dbClient.db.collection('files').aggregate(aggregateData);
    const filesArray = [];
    await files.forEach((item) => {
      const fileItem = {
        id: item._id,
        userId: item.userId,
        name: item.name,
        type: item.type,
        isPublic: item.isPublic,
        parentId: item.parentId,
      };
      filesArray.push(fileItem);
    });
    return res.json(filesArray);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

const putPublish = async (req, res) => {
  const token = req.header('X-Token') || null;
  const fileId = req.params.id || '';
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
    const findFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: findUser._id });
    if (!findFile) {
      return res.status(404).json({
        error: 'Not found',
      });
    }
    await dbClient.db.collection('files').updateOne(
      { _id: ObjectId(fileId) },
      { $set: { isPublic: true } },
    );

    const result = {
      id: findFile._id,
      userId: findFile.userId,
      name: findFile.name,
      type: findFile.type,
      isPublic: true,
      parentId: findFile.parentId,
    };
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

const putUnPublish = async (req, res) => {
  const token = req.header('X-Token') || null;
  const fileId = req.params.id || '';
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
    const findFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: findUser._id });
    if (!findFile) {
      return res.status(404).json({
        error: 'Not found',
      });
    }
    await dbClient.db.collection('files').updateOne(
      { _id: ObjectId(fileId) },
      { $set: { isPublic: false } },
    );

    const result = {
      id: findFile._id,
      userId: findFile.userId,
      name: findFile.name,
      type: findFile.type,
      isPublic: false,
      parentId: findFile.parentId,
    };
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

const getFile = async (req, res) => {
  const size = req.query.size || 0;
  const token = req.header('X-Token') || null;
  const fileId = req.params.id || '';
  try {
    const findFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId) });
    if (!findFile) {
      return res.status(404).json({
        error: 'Not found',
      });
    }
    let owner = false;
    const userId = await redisClient.get(`auth_${token}`);
    const findUser = await dbClient.db.collection('users').findOne({ _id: ObjectId(userId) });
    if (findUser) {
      owner = findUser._id.toString() === findFile.userId.toString();
    }
    if (findFile.isPublic === false && !owner) {
      return res.status(404).json({
        error: 'Not found',
      });
    }
    if (findFile.type === 'folder') {
      return res.status(400).json({
        error: "A folder doesn't have content",
      });
    }
    if (!findFile.localPath) {
      return res.status(404).json({
        error: 'Not found',
      });
    }
    const fileLocation = size === 0 ? findFile.localPath : `${findFile.localPath}_${size}`;
    const fileType = mimeTypes.lookup(findFile.name);
    res.set('Content-Type', fileType);
    const result = fs.readFileSync(fileLocation, 'utf-8');

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

module.exports = {
  postUpload,
  getShow,
  getIndex,
  putPublish,
  putUnPublish,
  getFile,
};
