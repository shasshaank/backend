import {asyncHandler} from '../utils/asyncHandler.js'
import {apiError} from '../utils/apiError.js'
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {apiResponse} from '../utils/apiResponse.js'

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

export {registerUser}

