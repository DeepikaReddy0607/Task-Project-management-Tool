import api from "./axios";

export const registerUser = async (userData) => {
    const response = await api.post(
        "/auth/register",
        userData
    );

    return response.data;
};

export const loginUser = async (credentials) => {
    const response = await api.post(
        "/auth/login",
        credentials
    );

    return response.data;
};

export const forgotPassword = async (email) => {
    const response = await api.post(
        "/auth/forgot-password",
        { email }
    );

    return response.data;
};

export const resetPassword = async (token, password) => {
    const response = await api.post(
        "/auth/reset-password",
        {
            token,
            password
        }
    );

    return response.data;
};

export const changePassword = async (
    currentPassword,
    newPassword
) => {
    const response = await api.post(
        "/auth/change-password",
        {
            currentPassword,
            newPassword
        }
    );

    return response.data;
};

export const logoutUser = () => {
    localStorage.removeItem("taskflow_token");
    localStorage.removeItem("taskflow_user");
};