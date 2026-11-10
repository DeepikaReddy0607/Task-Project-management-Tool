import api from "./axios";

export const getProfile = async () => {
    const response = await api.get(
        "/users/profile"
    );

    return response.data;
};


export const updateProfile = async (profileData) => {
    const response = await api.patch(
        "/users/profile",
        profileData
    );

    return response.data;
};

export const completeOnboarding = async () => {
    const response = await api.post(
        "/users/onboarding/complete"
    );

    return response.data;
};
