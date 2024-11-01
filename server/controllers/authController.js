const User = require("../models/User");
const bcrypt = require("bcrypt");
const { generateOtp } = require("../utils/otpGenerator");
const { sendOtpToEmail } = require("../utils/emailService");

const OTP_EXPIRE_TIME = 300000; // 5 minutes

// Register User (without saving user immediately)
exports.registerUser = async (req, res) => {
  const { firstName, lastName, phone, email, password } = req.body;

  // Validate phone number
  if (!phone || typeof phone !== "string" || phone.trim() === "") {
    return res
      .status(400)
      .json({ message: "Phone number is required and cannot be empty" });
  }

  try {
    // Check if the phone number already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: "Phone number already in use" });
    }

    // Generate OTP
    const otp = generateOtp();
    const expiration = Date.now() + OTP_EXPIRE_TIME;

    // Store OTP and expiration time along with the user's information
    const tempUser = {
      firstName,
      lastName,
      phone,
      email,
      password,
      otp,
      otpExpiration: expiration,
    };

    // Save the user in session or temporary storage for now
    req.session.tempUser = tempUser;

    // Send OTP email
    // await sendOtpToEmail(email, otp);
    console.log(otp);

    res.status(200).json({ message: "OTP sent to your email. Please verify." });
  } catch (error) {
    req.session.tempUser = null; // Clear session data on error
    console.error("Error during registration:", error.message);
    res.status(500).json({ error: "Error sending OTP or registering user" });
  }
};

// Verify OTP and complete registration
exports.verifyOtp = async (req, res) => {
  const sessionUser = req.session.tempUser;
  const { otp } = req.body;

  try {
    // Retrieve the temporary user data from session
    const tempUser = sessionUser;
    if (!tempUser) {
      return res
        .status(400)
        .json({ message: "User not found or session expired" });
    }

    // Check if OTP is valid and not expired
    if (tempUser.otp === otp && Date.now() < tempUser.otpExpiration) {
      // Hash the password and create a new user object to save to the database
      const hashedPassword = await bcrypt.hash(tempUser.password, 10);
      const user = new User({
        firstName: tempUser.firstName,
        lastName: tempUser.lastName,
        phone: tempUser.phone,
        email: tempUser.email,
        password: hashedPassword,
      });

      // Save the user to the database
      await user.save();

      // Automatically log in the user by saving their information in session
      req.session.user = {
        id: user._id,
        firstName: user.firstName,
        email: user.email,
      };

      res.status(200).json({
        message: "User registered and logged in successfully!",
        user: user.firstName,
      });
    } else {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error.message);
    res.status(500).json({ error: "Error verifying OTP" });
  }
};

// Login User
// Login User
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    req.session.user = {
      id: user._id,
      firstName: user.firstName,
      email: user.email,
    };

    // Send back the user information along with the message
    res.status(200).json({
      message: "Logged in successfully",
      user: {
        firstName: user.firstName, // Include first name
        email: user.email, // Include email if necessary
      },
    });
  } catch (error) {
    console.error("Error logging in:", error.message);
    res.status(500).json({ error: "Error logging in" });
  }
};

// Logout User
exports.logoutUser = (req, res) => {
  if (req.session.user) {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err.message);
        return res.status(500).json({ error: "Error logging out" });
      }
      res.clearCookie("connect.sid");
      return res.status(200).json({ message: "Logged out successfully" });
    });
  } else {
    return res.status(400).json({ message: "No user is logged in" });
  }
};

// Send OTP for email verification (Optional)
exports.sendOtp = async (req, res) => {
  const { email } = req.body;
  const otp = generateOtp();
  const expiration = Date.now() + OTP_EXPIRE_TIME;

  try {
    // Store OTP and its expiration in the user's document
    await User.updateOne({ email }, { otp, otpExpiration: expiration });

    // Send OTP email using the email service
    await sendOtpToEmail(email, otp);

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP:", error.message);
    res.status(500).json({ error: "Error sending OTP" });
  }
};
