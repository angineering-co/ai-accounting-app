-- Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'name',
    COALESCE(new.raw_user_meta_data ->> 'role', 'admin')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow authenticated users to create a firm
-- This is necessary for the onboarding flow described in TECH_DESIGN.md
CREATE POLICY "Authenticated users can create a firm" ON firms
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Also allow users to update their own profile's firm_id if it's currently null
-- This allows the onboarding flow to link the user to the newly created firm
CREATE POLICY "Users can link themselves to a firm" ON profiles
    FOR UPDATE
    USING (id = auth.uid() AND firm_id IS NULL);

