export const getAttemptId = () => sessionStorage.getItem('attempt_id')
export const setAttemptId = (id) => sessionStorage.setItem('attempt_id', id)
export const clearAttemptId = () => sessionStorage.removeItem('attempt_id')
