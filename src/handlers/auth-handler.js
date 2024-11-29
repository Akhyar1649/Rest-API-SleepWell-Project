require("dotenv").config();

const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validatePassword(password) {
  const regex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
}

async function signup(req, res) {
  const { name: rawName, email, password } = req.body;
  const name = rawName.trim().replace(/\s+/g, " ");

  if (!validateEmail(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }
  if (!name) {
    return res.status(400).json({ message: "Invalid name" });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({
      message:
        "Password must be 8+ characters with uppercase, lowercase, number, and special character",
    });
  }

  try {
    await admin.auth().getUserByEmail(email);
    return res.status(400).json({
      message: "Email already in use",
    });
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      try {
        const userRecord = await admin.auth().createUser({
          email: email,
          password: password,
          displayName: name,
        });
        const hashedPassword = await bcrypt.hash(password, 10);
        await admin.firestore().collection("users").doc(userRecord.uid).set({
          uid: userRecord.uid,
          name: name,
          email: email,
          password: hashedPassword,
        });
        return res.status(200).json({ message: "Success" });
      } catch (error) {
        console.error("Error creating user: ", error);
        return res.status(500).json({ message: "Error registering user" });
      }
    } else {
      console.error("Error checking user existence: ", error);
      return res.status(500).json({ message: "Error registering user" });
    }
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!validateEmail(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }
  if (!password) {
    return res.status(400).json({ message: "Invalid password" });
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const userId = userRecord.uid;
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      return res.status(400).json({ message: "Email not registered" });
    }
    const user = userDoc.data();

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const token = jwt.sign(
      {
        id: userId,
        email: user.email,
        name: user.name,
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "1d" }
    );
    user.password = undefined;
    return res.json({
      message: "Success",
      data: user,
      token,
    });
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return res.status(400).json({ message: "Email not registered" });
    }
    console.error("Error logging in user: ", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function getUser(req, res) {
  try {
    const { id } = req.user;
    const userDoc = await admin.firestore().collection("users").doc(id).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const userData = userDoc.data();
    delete userData.password;

    return res.status(200).json({
      message: "Success",
      data: userData,
    });
  } catch (error) {
    console.error("Error getting user profile:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

module.exports = {
  signup,
  login,
  getUser,
};
