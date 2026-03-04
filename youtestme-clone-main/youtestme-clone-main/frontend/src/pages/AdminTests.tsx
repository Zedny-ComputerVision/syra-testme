import { useEffect, useState } from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Alert } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import TestForm from '../components/TestForm';

interface Test {
    id: number;
    name: string;
    description: string;
    status: string;
    image: string;
    sensitivity: number;
    rules: any;
}

import { useNavigate } from 'react-router-dom';

const AdminTests = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [tests, setTests] = useState<Test[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editTest, setEditTest] = useState<Test | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchTests = async () => {
        try {
            setError(null);
            const res = await fetch('/api/admin/tests');
            if (!res.ok) throw new Error('Failed to fetch tests');
            const data = await res.json();
            if (Array.isArray(data)) {
                setTests(data);
            } else {
                console.error('Expected array but got:', data);
                setTests([]);
                setError('Received invalid data format from server');
            }
        } catch (error: any) {
            console.error('Error fetching tests:', error);
            setTests([]);
            setError(error.message || 'Failed to load tests');
        }
    };

    useEffect(() => {
        if (user?.role === 'admin') fetchTests();
    }, [user]);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this test?')) return;
        await fetch(`/api/tests/${id}`, { method: 'DELETE' });
        setTests(tests.filter(t => t.id !== id));
    };

    const openEdit = async (test: Test) => {
        try {
            const res = await fetch(`/api/questions/test/${test.id}`);
            let questions = [];
            if (res.ok) {
                questions = await res.json();
            }
            setEditTest({ ...test, questions } as any);
            setShowForm(true);
        } catch (error) {
            console.error('Failed to load questions:', error);
            setEditTest(test);
            setShowForm(true);
        }
    };

    const closeForm = () => {
        setEditTest(null);
        setShowForm(false);
    };

    const handleFormSubmit = async (testData: Partial<Test & { questions: any[] }>) => {
        const { questions, ...testOnlyData } = testData;

        if (editTest) {
            const res = await fetch(`/api/tests/${editTest.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testOnlyData),
            });
            const updated = await res.json();

            if (questions && questions.length > 0) {
                for (const question of questions) {
                    await fetch('/api/questions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...question, test_id: updated.id }),
                    });
                }
            }

            setTests(tests.map(t => (t.id === updated.id ? updated : t)));
        } else {
            const res = await fetch('/api/tests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testOnlyData),
            });
            const created = await res.json();

            if (questions && questions.length > 0) {
                for (const question of questions) {
                    await fetch('/api/questions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...question, test_id: created.id }),
                    });
                }
            }

            setTests([...tests, created]);
        }
        closeForm();
        fetchTests();
    };

    if (!user) return (
        <Box p={3}>
            <Typography variant="h6" gutterBottom>
                Please log in to access Test Management
            </Typography>
            <Button variant="contained" href="/login">Go to Login</Button>
        </Box>
    );
    if (user.role !== 'admin') return <Box p={3}><Typography>Access denied</Typography></Box>;

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1" fontWeight="bold">
                    Test Management
                </Typography>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => navigate('/admin/new-test')}
                >
                    Add New Test
                </Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell><strong>Name</strong></TableCell>
                            <TableCell><strong>Status</strong></TableCell>
                            <TableCell><strong>Sensitivity</strong></TableCell>
                            <TableCell align="right"><strong>Actions</strong></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {tests.map((test) => (
                            <TableRow key={test.id} hover>
                                <TableCell>{test.name}</TableCell>
                                <TableCell>{test.status}</TableCell>
                                <TableCell>{test.sensitivity}</TableCell>
                                <TableCell align="right">
                                    <IconButton
                                        color="primary"
                                        size="small"
                                        onClick={() => openEdit(test)}
                                        sx={{ mr: 1 }}
                                    >
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton
                                        color="error"
                                        size="small"
                                        onClick={() => handleDelete(test.id)}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {showForm && (
                <TestForm
                    initialData={editTest || undefined}
                    onClose={closeForm}
                    onSubmit={handleFormSubmit}
                />
            )}
        </Box>
    );
};

export default AdminTests;
