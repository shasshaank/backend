import {asyncHandler} from '../utils/asyncHandler.js'
import {apiError} from '../utils/apiError.js'
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {apiResponse} from '../utils/apiResponse.js'
import jwt from 'jsonwebtoken'

const generateAccessAndRefreshTokens = async(userId)=>{
    try{
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return {accessToken, refreshToken}

    }catch(error){
        throw new apiError(500,"Something went wrong while trying to generate access and refresh tokens")
    }
}

const registerUser = asyncHandler(async (req,res)=>{
    const {username,password,email,fullName} = req.body
    console.log("Email: ",email);

    console.log("req.files:", req.files);
    console.log("req.body:", req.body);

    if([fullName,username,email,password].some((field)=>field?.trim()==="")){
        throw new apiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ username },{ email }]
    })

    if(existedUser){
        throw new apiError(409, "User with email or password already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    let coverimageLocalPath;
    if (req.files && Array.isArray(req.files.coverimage) && req.files.coverimage.length > 0) {
        coverimageLocalPath = req.files.coverimage[0].path
    }
    

    if(!avatarLocalPath){
        throw new apiError(400,"Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverimage = await uploadOnCloudinary(coverimageLocalPath);

    if(!avatar){
        throw new apiError(400,"Avatar file is required");
    }

    const user = await User.create({
        fullName,
        avatar:avatar.url,
        coverImage: coverimage?.url||"",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new apiError(500,"Something went wrong while registering the user")
    }


    return res.status(201).json(
        new apiResponse(200, createdUser, "User registered Successfully")
    )
})

const loginUser = asyncHandler(async (req,res)=>{
    const {email,username,password} = req.body

    if(!username && !email){
        throw new apiError(400,"Username or email is required");
    }

    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if(!user){
        throw new apiError(404, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new apiError(401, "Invalid user credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new apiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User loggen In successfully"
        )
    )


})

const logoutUser = asyncHandler(async (req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new apiResponse(200,{}, "User logged Out"))

    
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
   try{
        const incomingRefreshToken =  req.cookies.refreshToken || req.body.refreshToken

        if(!incomingRefreshToken){
                throw new apiError(401, "Unauthorized request");
        }


        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)

        const user = User.findById(decodedToken?._id);

        if(!user){
            throw new apiError(401, "Invalid refresh token")
        }

        if(incomingRefreshToken !== user?.refreshToken){
                throw new apiError(401, "Refresh token is expired or used")
        }

        const options = {
                httpOnly:true,
                secure: true
        }

        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)

        return res
        .status(200)
        .cookie("accessToken",options)
        .cookie("refreshToken",options)
        .json(
                new apiResponse(
                    200,
                    {accessToken, refreshToken: newRefreshToken},
                    "Access token refreshed"
                )
        )
    }catch(error){
        throw new apiError(401, error?.message||"Invalid refresh Token ")
    }
})

export {registerUser,loginUser,logoutUser,refreshAccessToken}

