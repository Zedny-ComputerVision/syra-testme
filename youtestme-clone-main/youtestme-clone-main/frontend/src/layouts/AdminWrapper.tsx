import { type ReactNode } from 'react';

interface AdminWrapperProps {
    children: ReactNode;
}

const AdminWrapper = ({ children }: AdminWrapperProps) => {
    return (
        <>
            {children}
        </>
    );
};

export default AdminWrapper;
